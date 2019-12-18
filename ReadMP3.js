const fs = require("fs");

const PATH = "./東方萃夢想.mp3";

fs.readFile(PATH, (err, data) => {
    if(err) { console.error(err); return; }

    let frameCount = 0;
    let prevFrameOffset = 0;
    for(let i = 0; i < data.length; i++) {
        if(data[i] === 0xff && (data[i+1] === 0xfb || data[i+1] === 0xfa)) { // MP3
            let a = data[i+6] << 1;
            let b = data[i+7] >> 7;
            let mainDataBegin = a + b;

            console.log(`Frame ${frameCount}  Length:${i - prevFrameOffset}  MainDataBegin:${mainDataBegin}`);

            frameCount++;
            prevFrameOffset = i;
        }
    }
});
