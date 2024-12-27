const fs = require('fs');
const child_process = require('child_process');
const puppeteer = require('puppeteer');

const usage = 'Usage: node index.js <svgPath> <duration> <fps> <outDir>';
const imgExtension = 'png';
const imgType = 'png';

async function main() {
    const [nodePath, progPath, svgPath, durationStr, fpsStr, outDir] = process.argv;

    if (!outDir) {
        console.error('Error: Output directory (outDir) is not defined.');
        console.log(usage);
        process.exit(2);
    }

    if (!svgPath || !durationStr || !fpsStr) {
        console.error('Error: Missing required arguments.');
        console.log(usage);
        process.exit(2);
    }

    const svg = fs.readFileSync(svgPath, 'utf-8');
    const duration = parseFloat(durationStr);
    const fps = parseInt(fpsStr);

    console.log(`Duration: ${duration}s, Target FPS: ${fps}`);
    const totalFrames = Math.floor(60 * duration); // SVG runs at 60 FPS
    const digits = Math.ceil(Math.log10(totalFrames + 1));

    console.log(`Total Frames to Render: ${totalFrames}`);
    console.log(`Frame File Name Padding Digits: ${digits}`);

    process.chdir(outDir);
    await createFrames(svg, fps, totalFrames, digits);
    convertToMP4(fps, digits);
}

async function createFrames(svg, fps, totalFrames, digits) {
    const svgPaused = svg.replace('--play-state: running;', '--play-state: paused;');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--font-render-hinting=none'],
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    });

    const page = await browser.newPage();
    await page.setContent(svgPaused);

    const renderSettings = {
        type: imgType,
        omitBackground: false,
    };

    console.log('Rendering frames...');
    for (let i = 1; i <= totalFrames; i++) {
        const currentTime = ((i - 1) / 60); // SVG frame time in seconds (60 FPS)
        await page.evaluate(
            (startTime) => {
                document.querySelector('svg').style.setProperty('--start', startTime);
            },
            `${currentTime}s`
        );

        const frameNumber = String(i).padStart(digits, '0');
        renderSettings.path = `${frameNumber}.${imgExtension}`;
        const svgElement = await page.$('svg');
        await svgElement.screenshot(renderSettings);

        if (i % fps === 0 || i === totalFrames) {
            console.log(`Progress: Rendered frame ${frameNumber} of ${totalFrames}`);
        }
    }

    await browser.close();
    console.log('Frame rendering completed.');
}

function convertToMP4(fps, digits) {
    console.log('Converting frames to MP4...');
    const args = [
        '-hide_banner',
        '-loglevel', 'warning',
        '-y',
        '-framerate', '60', // Input frame rate (SVG is 60 FPS)
        '-i', `%0${digits}d.${imgExtension}`,
        '-vf', 'scale=iw:ih', // Add scaling filter to fix resolution issues
        '-c:v', 'libx264',
        '-r', `${fps}`, // Output frame rate
        '-pix_fmt', 'yuv420p',
        'output.mp4',
    ];

    try {
        const output = child_process.execFileSync('ffmpeg', args, { encoding: 'utf8' });
        console.log(output);
        console.log('MP4 conversion completed.');
    } catch (err) {
        console.error('Error during MP4 conversion:', err.message);
        process.exit(1);
    }
}

main();