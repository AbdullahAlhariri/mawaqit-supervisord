const https = require('https');
const { spawn } = require('child_process');

// State
const url = 'https://mawaqit.net/nl/attaqwa-etten-leur'
const cache = new Map();
let azanPlaying = false;
let bellPlaying = false;
let volumeScaler = 20;
let rebootEnabled = true;

setInterval(async () => {
    console.log(`Daemon is living: ${new Date().toLocaleString()}`);

    const day = new Date().getDate(); // begins with 1!
    const month = new Date().getMonth(); // begins with 0!

    const cacheKey = day + '-' + month + '-' + new Date().getFullYear();
    const prayers = cache.get(cacheKey);
    if (prayers) {
        console.log('Cache retrieved: ' + cacheKey);
        azanOnDemand(prayers)
        return
    }

    https.get(url, (res) => {
        let html = '';

        res.on('data', chunk => {
            html += chunk;
        });

        res.on('end', () => {
            try {
                const re = new RegExp(/^.*confData\s*=\s*(?<confData>.*);$/m);
                const data = re.exec(html).groups['confData']

                const json = JSON.parse(data);
                const prayers = json['calendar'][month][day]
                prayers.splice(1,1)

                cache.set(cacheKey, prayers);
                console.log('Cache set: ' + cacheKey);
            } catch (e) {
                console.error('Failed to parse response as JSON:', e.message);
            }
        });

    }).on('error', (err) => {
        console.log(err)
    });
}, 1000)

function azanOnDemand(prayers) {
    const [minutesUntilNext, minTime] = getMinutesToNextTime(prayers);

    switch (minutesUntilNext) {
        case 0:
            azan(prayers.indexOf(minTime) === 0)
            break;
        case 5:
            if (prayers.indexOf(minTime) === 0) {
                reboot()
            }
            break;
        case 10:
            bell()
    }
}

function azan(fajr=false) {
    if (azanPlaying) {
        return;
    }
    azanPlaying = true;
    setTimeout(() => {
        azanPlaying = false;
        console.log('Azan ended, lock removed')
    }, 5 * 60 * 1000); // 5 minutes lock
    console.log('Azan playing, lock created')

    const file = fajr ? 'fajr' : 'regular';
    const volume = (fajr ? '4' : '1') * volumeScaler;
    spawn('pactl', ['set-sink-volume', '@DEFAULT_SINK@', '100%'])
    spawn('ffplay', ['-nodisp', '-volume', volume, '-autoexit', __dirname + `/azan/${file}.mp3`]);
}

function bell() {
    if (bellPlaying) {
        return;
    }
    bellPlaying = true;
    setTimeout(() => {
        bellPlaying = false;
        console.log('Bell ended, lock removed')
    }, 2 * 60 * 1000); // 2 minutes lock
    console.log('Bell playing, lock created')

    spawn('pactl', ['set-sink-volume', '@DEFAULT_SINK@', '100%'])
    spawn('ffplay', ['-nodisp', '-volume', volumeScaler, '-autoexit', __dirname + '/azan/bell.wav']);
}

function getMinutesToNextTime(times) {
    // const now = new Date('02-01-2026 12:45:30');
    // const now = new Date('02-01-2026 7:02:30');
    const now = new Date();

    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let minDiff = Infinity;
    let minTime = '00:00';

    for (const time of times) {
        const [hours, minutes] = time.split(":").map(Number);
        const timeInMinutes = hours * 60 + minutes;

        let diff = timeInMinutes - currentMinutes;
        if (diff < 0) {
            // if time already passed, add 24 hours
            diff += 24 * 60;
        }

        if (diff < minDiff) {
            minDiff = diff;
            minTime = time;
        }
    }

    return [minDiff, minTime];
}

function reboot() {
    if (!rebootEnabled) {
        return;
    }

    spawn('reboot');
}