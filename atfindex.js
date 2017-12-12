/**
 * @Authors: Diego da Hora
 *           Alemnew Asrese				
 * @emails:  diego.hora@gmail.com
 *           alemnew.asrese@aalto.fi
 * @date:   2017-05-30
 */

/*
    PLUGIN configuration options
*/
var VERBOSITY; //DEBUG, WARNING, OUTPUT (default)
var savePageProfile; //0:Nothing, 1:Save statistics, 2:Stats + Page profile, 3:Stats + Page profile + Timing, 4:Full log
var delay_to_calculate;
var stats = {}

function restore_options() {
  chrome.storage.sync.get({
    verbosity: 'OUTPUT',
    save_file: false,
    delay: 4000
  }, function(items) {
    VERBOSITY          = items.verbosity;
    savePageProfile    = items.save_file;
    delay_to_calculate = items.delay;
    log("Options found: " + VERBOSITY + ',' + savePageProfile + ',' + delay_to_calculate, "DEBUG")
  });
}
restore_options();

//Global variables
var output="";
// window size
var screenRect = {};
screenRect.left   = 0;
screenRect.top    = 0;
screenRect.right  = $(window).width();
screenRect.bottom = $(window).height();

if (!screenRect.right)  screenRect.right = 1024;
if (!screenRect.bottom) screenRect.bottom = 768;

//Function callback install
window.addEventListener("load", function(event) {
    log("window onload", "DEBUG")
    setTimeout(function(){
        calculateATF()
    }, delay_to_calculate);
});


//Main function
function calculateATF(){
    var imgs = document.getElementsByTagName("img");
    log("Number of imgs found: " + imgs.length);

    var hashImgs = {};
    var countATF = 0;
    var img_pixels = 0;

    for (i = 0; i < imgs.length; i++) {
        var rect = imgs[i].getBoundingClientRect()
        
        imgs[i].onscreen = intersectRect(rect, screenRect);

        if (imgs[i].onscreen) {
            imgs[i].screen_area = overlapRect(screenRect, rect);
            if (imgs[i].screen_area >= 0) countATF+=1;
            img_pixels += imgs[i].screen_area;
        }

        var key = geturlkey(imgs[i].src);
        if ( !(key in hashImgs) ) {
            hashImgs[ key ] = imgs[i];
        } else {
            log("Repeated img <" + i + ">: "+ imgs[i].src, 'WARNING');
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

    log("Img pixels: "          + img_pixels);
    log("Distinct img sources Found: " + Object.keys(hashImgs).length);
    //log(imgResource.length);

    //ATF pixel img loaded 
    img_pixels = 0; 
    var screenimgs = [];

    for (i = 0; i < imgs.length; i++){
        if ('loadtime' in imgs[i])
            if (imgs[i].onscreen && (imgs[i].screen_area >= 0) ) {
                screenimgs.push(imgs[i]);
                img_pixels += imgs[i].screen_area;
            }
    }
    
    screenimgs.sort(function(a,b){
        return a.loadtime - b.loadtime;
    });

    log("Images above the fold considered: " + screenimgs.length)


    log("---- OPTIMISTIC ATF ----", "DEBUG");
    var count_pixels = recordImgs(screenimgs, stats, false);

    // log("---- PESSIMISTIC ATF ----");
    // var count_pixels = recordImgs(screenimgs, stats, true);
    
    var t = performance.timing;
    stats.dom = t.domContentLoadedEventEnd - t.navigationStart;
    stats.plt = t.loadEventEnd             - t.navigationStart;

    var page_img_ratio = 1.0*count_pixels / (screenRect.right * screenRect.bottom);
    log("count_pixels:" + count_pixels);
    log("Image to page ratio: " + page_img_ratio);
    
    var resources = window.performance.getEntriesByType("resource");
   
    stats.count_pixels   = count_pixels;
    stats.right          = screenRect.right;
    stats.bottom         = screenRect.bottom;
    stats.atf            = stats.atf_integral;
    stats.ii_plt         = index_metric(resources, stats.dom, stats.plt, metric='image');
    stats.ii_atf         = index_metric(resources, stats.dom, stats.atf, metric='image');
    stats.oi_plt         = index_metric(resources, stats.dom, stats.plt, metric='object');
    stats.oi_atf         = index_metric(resources, stats.dom, stats.atf, metric='object');
    stats.bi_plt         = index_metric(resources, stats.dom, stats.plt, metric='bytes');
    stats.bi_atf         = index_metric(resources, stats.dom, stats.atf, metric='bytes');



    var tags = ['img', 'map', 'area', 'canvas', 'figcaption', 'figure', 'picture', 'audio', 'source', 'track', 'video', 'object', 'a']
    var list_dom = [];
    for (i=0; i<tags.length; i++){
        var elmts = document.getElementsByTagName(tags[i]);

        for (j=0; j<elmts.length; j++){
            list_dom.push( obj_dict(elmts[j]) );
        }
    }

    if(savePageProfile>1) stats.timing         = t;
    if(savePageProfile>1) imageProfile(imgs, stats); 
    if(savePageProfile>2) stats.resources      = resources;
    if(savePageProfile>3) stats.list_dom       = list_dom;

    //Printing results
    log("DOM:    " + stats.dom.toFixed(2) )
    log("II_plt: " + stats.ii_plt.toFixed(2))
    log("II_atf: " + stats.ii_atf.toFixed(2))
    log("OI_plt: " + stats.oi_plt.toFixed(2))
    log("OI_atf: " + stats.oi_atf.toFixed(2))
    log("BI_plt: " + stats.bi_plt.toFixed(2))
    log("BI_atf: " + stats.bi_atf.toFixed(2))
    log("ATF:    " + stats.atf.toFixed(2) )
    log("PLT:    " + stats.plt.toFixed(2) )

    if (savePageProfile>0){
        
        var pageurl = geturlkey(window.location.toString());
        var filename  = "profile_"+pageurl+".json";
            
        var obj = {}
        obj[pageurl] = stats;
        writeObjToFile(obj, filename)
    }

    console.log(output)
}

function index_metric(objects, min_time, max_time, metric='bytes'){
    //types = img, css, link , script
    var total_cost = 0.0;
    var index      = 0.0;

    for (var i=0; i<objects.length; i++){
        var loadtime = objects[i]['responseEnd'];
        var obj_type = objects[i]['initiatorType'];
        var obj_size = objects[i]['decodedBodySize'];

        var weight = 1.0;
        if (metric == 'images' && obj_type != 'img') weight = 0.0; 

        if (loadtime < min_time) loadtime = min_time;
        if (loadtime > max_time) continue;

        if (metric == 'object')
            cost_metric = 1.0
        else
            cost_metric = obj_size;

        cost   = weight*cost_metric
        index += loadtime * cost

        total_cost+= cost
    }

    if (total_cost > 0.0){
        index /= total_cost;
    }

    return index 
}


function log(str, out="OUTPUT"){
    if (out=="DEBUG" && VERBOSITY=="DEBUG"){
        console.log(str);
    } else if (out == "WARNING" && (VERBOSITY=="WARNING" || VERBOSITY=="DEBUG")){
        output = output + "WARNING: " + str + "\n";
    } else if (out == "OUTPUT"){
        output = output + str + "\n";
    } else {
        //Suppress output
    }
}

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

    log("Image resources found: " + imgResource.length);

    return imgResource;
}


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
            log("Skipping image [" + i + "], loadtime " + screenimgs[i].loadtime + ": " +screenimgs[i], "WARNING");
            continue;
        }
        
        var loadtime = screenimgs[i].loadtime;  
        if(loadtime < domload) loadtime = domload;  //The minimum loadtime is the DOM PLT

        atf_integral  += (loadtime) * (1.0*count[i]/count_pixels);
        
        if (loadtime > atf_instant){
            atf_instant = screenimgs[i].loadtime;
        }
        log(screenimgs[i], "DEBUG");
        log("Img [" + i + "]: " + count[i] + ", ratio = " +  1.0*count[i]/count_pixels + ", loadtime " + screenimgs[i].loadtime + ". atf_integral: " + atf_integral, "DEBUG" );
    }
    
    log("ATFintegral: " + atf_integral);
    log("ATFinstant:  " + atf_instant);
    
    stats.atf_integral   = atf_integral;
    stats.atf_instant    = atf_instant;

    return count_pixels;
}

function recordImg(img, bitmap, reverse){
    var rect = img.getBoundingClientRect();
    
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
                log( "Overlap at ("+x+","+y+")", "WARNING")
            }
        }
    }

    if(reverse){
        img.pessimistic = count;
    } else {
        img.optimistic  = count;
    }
        
    return count;
}


function isDict(v) {
    return typeof v==='object' && v!==null && !(v instanceof Array) && !(v instanceof Date);
}
//Recursive object clean-up for easier storage
function obj_dict(obj){

    var new_obj = {}
    for (var prop in obj){

        if ( isDict(obj[prop]) ) {
            new_obj[prop] = clean_dict(obj[prop])
        } else {

            if (obj[prop] == null) continue;
            if (obj[prop] == '') continue;
            if (obj[prop] == {}) continue;
            if (obj[prop].length == 0) continue;

            new_obj[prop] = obj[prop]
        }

    }
    return new_obj
}

function clean_dict(obj){

    var new_obj = {}
    for (var prop in obj){

        if (obj[prop] == null) continue;
        if (obj[prop] == '') continue;
        if (obj[prop] == {}) continue;
        if (obj[prop].length == 0) continue;

    }
    return new_obj
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

    log("Distinct imgs: " + imgKeys.length  + ", Distinct res: " + resKeys.length);
    
    //Comparing a to b:
    var count_no_img = 0;
    var count_no_res = 0;

    for (var i=0;i<imgKeys.length;i++){
        key = imgKeys[i];
        if ( !(key in hashRes) ){
            count_no_img += 1;
            log('Resource missing for img key: ' + key, "WARNING");
        }
    }

    for (var i=0; i<resKeys.length; i++ ){
        key = resKeys[i];
        if ( !(key in hashImgs) ){
            count_no_res += 1;
            res = hashRes[key];
            log('Resource missing for res key name <' +res[1]+ ">:" + res[0].name, "WARNING");
        }
    }

    log("Missing imgs on res: " + count_no_img, "WARNING");
    log("Missing res on imgs: " + count_no_res, "WARNING");
}

function getParameterOrNull(obj, parameter){
    if (parameter in obj){
        return obj[parameter];
    } else {
        return 'null';
    }
}

function imageProfile(imgs, stats){
    
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
    log("Saving object to file: " + filename, "DEBUG");
    var blob = new Blob([JSON.stringify(object)], {type: "text/plain;charset=utf-8"});
    saveAs(blob, filename);
}

log("ATFindex loaded", "DEBUG");

