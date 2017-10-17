/**
 * @Authors: Diego da Hora
 *           Alemnew Asrese				
 * @emails:  diego.hora@gmail.com
 *           alemnew.asrese@aalto.fi
 * @date:   2017-05-30
 */

function intersectRect(r1, r2) {
  return !(r2.left > r1.right || 
           r2.right < r1.left || 
           r2.top > r1.bottom ||
           r2.bottom < r1.top);
}

function overlapRect(r1, r2){
    x11 = r1.left;
    y11 = r1.top;
    x12 = r1.right;
    y12 = r1.bottom;
    x21 = r2.left;
    y21 = r2.top;
    x22 = r2.right;
    y22 = r2.bottom;

    x_overlap = Math.max(0, Math.min(x12,x22) - Math.max(x11,x21));
    y_overlap = Math.max(0, Math.min(y12,y22) - Math.max(y11,y21));
    return x_overlap * y_overlap;
}

function geturlkey(url){
    return url.trim().replace(/^https:/,'http:').replace(/\/$/,'').toLowerCase();
}

function getImgRes(){
    var resourceList = window.performance.getEntriesByType("resource");
    var imgResource = [];

    for (i = 0; i < resourceList.length; i++) {
        if (resourceList[i].initiatorType != "img")     continue;
        if (resourceList[i].name.match(/[.](css|js)$/)) continue;
        if (resourceList[i].name.match(/[.](css|js)[?].*$/)) continue;
        
        imgResource.push( resourceList[i] );
    }

    console.log("Image resources found: " + imgResource.length);

    return imgResource;
}

// window size
var screenRect = {};
screenRect.left   = 0;
screenRect.top    = 0;
screenRect.right  = $(window).width();
screenRect.bottom = $(window).height();

if (!screenRect.right)  screenRect.right = 1024;
if (!screenRect.bottom) screenRect.bottom = 768;

//Generate new screen bitmap

function createBitmap(){
    var bitmap = new Array(screenRect.right);
    for (var i=0; i<=screenRect.right; i++){
        bitmap[i] = new Array(screenRect.bottom)
        for (var j=0; j<=screenRect.bottom; j++){
            bitmap[i][j] = null;
        }
    }   
    return bitmap;
}

/*
    There are two ways to fill the bitmap
    1 - Regular load order: Optimistic ATF integral
    2 - Reverse load order: Pessimistic ATF integral
*/
function recordImgs(screenimgs, stats, reverse){
    var count_pixels = 0;
    var count = new Array(screenimgs.length);
    var bitmap = createBitmap();

    var t = performance.timing;
    var domload = t.domContentLoadedEventEnd - t.fetchStart;
    var onload  = t.loadEventEnd             - t.fetchStart;

    for (var i =0; i<screenimgs.length; i++) {
        if (reverse){
            idx = screenimgs.length -i -1;
        } else {
            idx = i;
        }

        if ('loadtime' in screenimgs[idx]){
            var c = recordImg(screenimgs[idx], bitmap, reverse);
            count[idx] = c;
            count_pixels+=c;
        } else {
            count[idx] = 0;
        }
    }

    var atf_integral = 0.0;
    var atf_instant  = 0.0;
    var cumpixels    = 0.0;

    for (var i=0; i<screenimgs.length; i++){
        if (!('loadtime' in screenimgs[i])) continue;
        if (count[i]==0) {
            //console.log("Skipping image [" + i + "], loadtime " + screenimgs[i].loadtime + ": " +screenimgs[i]);
            continue;
        }
        
        var loadtime = screenimgs[i].loadtime;  
        if(loadtime < domload) loadtime = domload;  //The minimum loadtime is the DOM PLT

        atf_integral  += (loadtime) * (1.0*count[i]/count_pixels);
        
        if (loadtime > atf_instant){
            atf_instant = screenimgs[i].loadtime;
        }
        console.log(screenimgs[i]);
        console.log("Img [" + i + "]: " + count[i] + ", ratio = " +  1.0*count[i]/count_pixels + ", loadtime " + screenimgs[i].loadtime + ". atf_integral: " + atf_integral );
    }
    
    var stat = {}
    console.log("ATFintegral: " + atf_integral);
    console.log("ATFinstant:  " + atf_instant);
    
    stat.atf_integral   = atf_integral;
    stat.atf_instant    = atf_instant;

    if (reverse == true){
        stats.pessimistic = stat;
    } else {
        stats.optimistic  = stat;
    }
    return count_pixels;
}

function recordImg(img, bitmap, reverse){
    var rect = img.getBoundingClientRect();
    //console.log("START Img (" +rect.width+ "x"+rect.height+") @ ("+rect.left+","+rect.top+") : " + (rect.width*rect.height) );

    var count = 0;
    if ( !('loadtime' in img) ) return 0;

    for (var i=0; i<rect.width; i++) {
        var x = Math.floor(i+rect.left);
        if(x <  0) continue;
        if(x >= screenRect.right)  continue;

        for (var j=0; j<rect.height; j++){
            var y = Math.floor(j+rect.top);
            if(y < 0) continue;
            if(y >= screenRect.bottom) continue;
            
            if( !bitmap[x][y] ) {
                bitmap[x][y] = img;
                count+=1
            } else {
                //console.log( "Overlap at ("+x+","+y+")")
            }
        }
    }

    //console.log("Img (" +rect.width+ "x"+rect.height+") @ ("+rect.left+","+rect.top+") : " + (rect.width*rect.height) + ", painted: " + count + ". Ratio: " + (count/(rect.width*rect.height)));
    if(reverse){
        img.pessimistic = count;
    } else {
        img.optimistic  = count;
    }
        
    return count;
}

//get video ready state
function setVideoListener(){
    var videos = document.getElementsByTagName('video');
    if (videos.length == 0) {
        console.log("No video element found.")
        return;
    }

    for (var i=0; i<videos.length; i++){
        videos[i].addEventListener('loadeddata', function() {
            if(this.readyState >= 3) {
                var d = new Date();
                var n = d.getTime();
                var video_load = n - performance.timing.fetchStart;
                console.log("video: " + this.src + ", loaded at: " + video_load);
            }
        });
    }   
}

/**
    Research questions
    - Are resources similar to HAR?
    - Are there repeated entries in resources list?
*/
function calculateATF(){
    var imgs = document.getElementsByTagName("img");
    console.log("Number of imgs found: " + imgs.length);

    var hashImgs = {};
    var countATF = 0;
    var img_pixels = 0;

    for (i = 0; i < imgs.length; i++) {
        var rect = imgs[i].getBoundingClientRect()
        
        imgs[i].onscreen = intersectRect(rect, screenRect);

        if (imgs[i].onscreen) {
            imgs[i].screen_area = overlapRect(screenRect, rect);
            if (imgs[i].screen_area > 0) countATF+=1;
            img_pixels += imgs[i].screen_area;
        }

        var key = geturlkey(imgs[i].src);
        if ( !(key in hashImgs) ) {
            hashImgs[ key ] = imgs[i];
        } else {
            console.log("Repeated img <" + i + ">: "+ imgs[i].src);
        }
    }

    var imgResource = getImgRes();

    //Setting load time on page imgs
    for (i = 0; i < imgResource.length; i++) {
        var load_time = imgResource[i].responseEnd;

        var imgsrc = geturlkey(imgResource[i].name);
        if (imgsrc in hashImgs){
            hashImgs[ imgsrc ].loadtime = load_time;
        } 
    }

    console.log("Img pixels: "          + img_pixels);

    console.log("Distinct img sources Found: " + Object.keys(hashImgs).length);
    console.log(imgResource.length);

    //ATF pixel img loaded 
    img_pixels = 0; 
    var screenimgs = [];

    for (i = 0; i < imgs.length; i++){
        if ('loadtime' in imgs[i])
            if (imgs[i].onscreen && (imgs[i].screen_area > 0) ) {
                screenimgs.push(imgs[i]);
                img_pixels += imgs[i].screen_area;
            }
    }
    
    screenimgs.sort(function(a,b){
        return a.loadtime - b.loadtime;
    });

    console.log("Images above the fold considered: " + screenimgs.length)

    var stats = {}

    console.log("---- OPTIMISTIC ATF ----");
    recordImgs(screenimgs, stats, false);

    console.log("---- PESSIMISTIC ATF ----");
    var count_pixels = recordImgs(screenimgs, stats, true);
    
    var t = performance.timing;
    var domload = t.domContentLoadedEventEnd - t.fetchStart;
    var onload  = t.loadEventEnd             - t.fetchStart;

    var page_img_ratio = 1.0*count_pixels / (screenRect.right * screenRect.bottom);
    stats.count_pixels   = count_pixels;
    console.log("count_pixels:" + count_pixels);
    console.log("Image to page ratio: " + page_img_ratio);
    console.log("DOMload:     " + domload);
    console.log("onload:      " + onload);


    stats.domload        = domload;
    stats.onload         = onload;
    stats.right          = screenRect.right;
    stats.bottom         = screenRect.bottom;


    profileAndWrite(imgs, stats);
    var pageurl = geturlkey(window.location.toString());
    var filename  = "profile_"+pageurl+".json";
        
    var obj = {}
    obj[pageurl] = stats;
    writeObjToFile(obj, filename)
}


function compareList(hashImgs, imgResource){
    var hashRes = {}
    for (var i =0; i<imgResource.length; i++){
        key = geturlkey(imgResource[i].name)
        if (key in hashRes){
            //hashRes[key]+=1
        } else {
            hashRes[key]=[imgResource[i],i]
        }
    }

    var imgKeys = Object.keys(hashImgs);
    var resKeys = Object.keys(hashRes);

    console.log("Distinct imgs: " + imgKeys.length  + ", Distinct res: " + resKeys.length);
    
    //Comparing a to b:
    var count_no_img = 0;
    var count_no_res = 0;

    for (var i=0;i<imgKeys.length;i++){
        key = imgKeys[i];
        if ( !(key in hashRes) ){
            count_no_img += 1;
            console.log('Resource missing for img key: ' + key);
        }
    }

    for (var i=0; i<resKeys.length; i++ ){
        key = resKeys[i];
        if ( !(key in hashImgs) ){
            count_no_res += 1;
            res = hashRes[key];
            console.log('Resource missing for res key name <' +res[1]+ ">:" + res[0].name);
        }
    }

    console.log("Missing imgs on res: " + count_no_img);
    console.log("Missing res on imgs: " + count_no_res);
}
//compareList(hashImgs, imgResource);
window.addEventListener("load", function(event) {
    console.log("window onload")
    setTimeout(function(){
        calculateATF()
    }, 1000);
});

console.log("ATFindex loaded");
setVideoListener();

function getElementsByXY(x,y){
    var clickX = x
        ,clickY = y
        ,list
        ,offset
        ,range
        ,body = $('body').parents();

    list = $('body *').filter(function() {
        offset = $(this).offset();
        range = {
            x: [ offset.left,
                offset.left + $(this).outerWidth() ],
            y: [ offset.top,
                offset.top + $(this).outerHeight() ]
        };

        return (clickX >= range.x[0] && clickX <= range.x[1]) && (clickY >= range.y[0] && clickY <= range.y[1])

    });

    list = list.add(body);
    list = list.map(function() {
        return "<" + this.tagName + ": " + this.nodeName + ',' + this.className+"> "
    }).get();

    alert(list)
;    return false;
}

function getParameterOrNull(obj, parameter){
    if (parameter in obj){
        return obj[parameter];
    } else {
        return 'null';
    }
}

function profileAndWrite(imgs, stats){
    
    var imglist = [];
    for (var i = 0; i<imgs.length; i++) {
        imgd = {}
        
        imgd.src         = imgs[i].src;
        imgd.name        = geturlkey(imgs[i].src);
        imgd.rect        = imgs[i].getBoundingClientRect();
        imgd.x           = getParameterOrNull(imgs[i],'x');
        imgd.y           = getParameterOrNull(imgs[i],'y');
        imgd.width       = getParameterOrNull(imgs[i],'width');
        imgd.height      = getParameterOrNull(imgs[i],'height');
        imgd.loadtime    = getParameterOrNull(imgs[i],'loadtime');
        imgd.optimistic  = getParameterOrNull(imgs[i],'optimistic');
        imgd.pessimistic = getParameterOrNull(imgs[i],'pessimistic');

        imglist.push(imgd);
    }
    
    stats.imgs = imglist;
}

function writeObjToFile(object, filename){
    console.log("Saving object to file: " + filename);
    var blob = new Blob([JSON.stringify(object)], {type: "text/plain;charset=utf-8"});
    saveAs(blob, filename);
}