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
var VERBOSITY='OUTPUT';      //DEBUG, WARNING, OUTPUT (default)
var savePageProfile=0;       //0:Nothing, 1:Save statistics, 2:Stats + Page profile, 3:Stats + Page profile + Timing, 4:Full log
var delay_to_calculate=1000; //In milliseconds
var hard_deadline=20000;     //Default = 20s
var version = 1.37;
var stats = {}
var executed = false;

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

function restore_options() {
    chrome.storage.sync.get({
        verbosity: 'OUTPUT',
        save_file: false,
        delay: 4000,
        hard_deadline: 10000
    }, function(items) {
        VERBOSITY          = items.verbosity;
        savePageProfile    = items.save_file;
        delay_to_calculate = items.delay;
        hard_deadline      = items.hard_deadline;
        log("Options -> Verbosity: " + VERBOSITY + ', save: ' + savePageProfile + 
            ', delay: ' + delay_to_calculate + ', deadline: '+hard_deadline, "DEBUG")
        
        //Schedule execution: HARD_DEADLINE option
        setTimeout(function(){ 
            log("hard deadline execution. Already executed? " + executed, "DEBUG")
            calculateATF() 
        }, hard_deadline);

        //Schedule execution: ONLOAD option
        window.addEventListener("load", function(event) { 
            log("window onload execution. Already executed? " + executed, "DEBUG")
            setTimeout(function(){
                calculateATF()
            }, delay_to_calculate);
        });
    });
}
restore_options();
// setTimeout(function(ev){console.log("Time is up!")},5000);
// console.log("Plugin ended")

//Global variables
var output="";
// window size
var screenRect = {};
screenRect.left   = 0;
screenRect.top    = 0;
screenRect.right  = document.documentElement.clientWidth;
screenRect.bottom = document.documentElement.clientHeight;

if (!screenRect.right)  screenRect.right = 1024;
if (!screenRect.bottom) screenRect.bottom = 768;

//Main function
function calculateATF(){

    if (executed) {
        return; 
    }
    executed = true;
    var script_start_time = performance.now();

    var imgs = document.getElementsByTagName("img");
    log("Version:          " + version);

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
            log("Repeated img <" + i + ">: "+ imgs[i].src, 'WARNING');
        }
    }

    var [imgResource,jsResource,cssResource] = getResources();


    //Setting load time on page imgs
    for (i = 0; i < imgResource.length; i++) {
        var load_time = imgResource[i].responseEnd;

        var imgsrc = geturlkey(imgResource[i].name);
        if (imgsrc in hashImgs){
            hashImgs[ imgsrc ].loadtime = load_time;
        } 
    }

    
    //ATF pixel img loaded 
    img_pixels = 0; 
    var screenimgs = [];
    stats.last_img = 0.0;
   
    for (i = 0; i < imgs.length; i++){
        if ('loadtime' in imgs[i])
            if (imgs[i].onscreen && (imgs[i].screen_area > 0) ) {
                screenimgs.push(imgs[i]);
                img_pixels += imgs[i].screen_area;
                if (imgs[i].loadtime > stats.last_img) stats.last_img = imgs[i].loadtime;
            }
    }
    
    screenimgs.sort(function(a,b){
        return a.loadtime - b.loadtime;
    });

    jsResource.sort(function(a,b){
        return a.responseEnd - b.responseEnd;
    });

    for (i = 0; i < screenimgs.length; i++){
        log("Img["+i+"] loaded at " + screenimgs[i].loadtime.toFixed(2) + " ms: ", "DEBUG");
        log(screenimgs[i], "DEBUG")
    }

    for (i = 0; i < jsResource.length; i++){
        log("JS["+i+"] loaded at " + jsResource[i].responseEnd.toFixed(2) + " ms: ", "DEBUG");
        log(jsResource[i], "DEBUG")
    }


    log("---- CALCULATING ATF ----", "DEBUG");
    calcWebMetrics(jsResource, cssResource, stats);

    var t = performance.timing;

    var page_img_ratio = 1.0*img_pixels / (screenRect.right * screenRect.bottom);
    var resources = window.performance.getEntriesByType("resource");

    
    var total_bytes = 0.0;
    var hash_tld = {};
    for (i=0; i<resources.length; i++){
        total_bytes += resources[i].transferSize / 1024.0;
        hash_tld[ getRootDomain(resources[i].name) ] = true;
    }
    stats.total_bytes    = total_bytes;
    stats.num_origins    = Object.keys(hash_tld).length;
    
    stats.version        = version;
    stats.right          = screenRect.right;
    stats.bottom         = screenRect.bottom;
    stats.num_img        = imgResource.length;
    stats.num_js         = jsResource.length;
    stats.num_css        = cssResource.length;
    stats.num_res        = resources.length;
    stats.ii_plt         = index_metric(resources, stats.dom, stats.plt, metric='image');
    stats.ii_atf         = index_metric(resources, stats.dom, stats.atf, metric='image');
    stats.oi_plt         = index_metric(resources, stats.dom, stats.plt, metric='object');
    stats.oi_atf         = index_metric(resources, stats.dom, stats.atf, metric='object');
    stats.bi_plt         = index_metric(resources, stats.dom, stats.plt, metric='bytes');
    stats.bi_atf         = index_metric(resources, stats.dom, stats.atf, metric='bytes');

    var tags = ['img', 'map', 'area', 'canvas', 'figcaption', 'figure', 'picture', 'audio', 'source', 'track', 'video', 'object', 'a']

    if(savePageProfile>=2) stats.timing         = t;
    if(savePageProfile>=1) imageProfile(imgs, stats); 
    if(savePageProfile>=3) stats.resources      = resources;

    //Printing results
    
    log("Img pixels:       " + img_pixels, "DEBUG");
    log("distinct_imgs:    " + Object.keys(hashImgs).length);
    log("num_atf_img:      " + screenimgs.length)
    log("image-page ratio: " + page_img_ratio.toFixed(2));
    log("page_width        " + stats.right      .toFixed(2) )
    log("page_height       " + stats.bottom     .toFixed(2) )
    log("total_kbytes      " + stats.total_bytes.toFixed(2) )
    log("num_origins       " + stats.total_bytes.toFixed(2) )
    log("II_plt:           " + stats.ii_plt.toFixed(2))
    log("II_atf:           " + stats.ii_atf.toFixed(2))
    log("OI_plt:           " + stats.oi_plt.toFixed(2))
    log("OI_atf:           " + stats.oi_atf.toFixed(2))
    log("BI_plt:           " + stats.bi_plt.toFixed(2))
    log("BI_atf:           " + stats.bi_atf.toFixed(2))
    log("ATF_img:          " + stats.last_img.toFixed(2) )
    log("JS:               " + stats.last_js.toFixed(2) )
    log("CSS:              " + stats.last_css.toFixed(2) )
    log("ATF:              " + stats.atf.toFixed(2) )
    log("PLT:              " + stats.plt.toFixed(2) )

    var pageurl = geturlkey(window.location.toString());
    var filename  = "profile_"+pageurl+".json";
        
    var obj = {}
    obj[pageurl] = stats;

    stats.execution      = runtime;

    if (savePageProfile>0){
        writeObjToFile(obj, filename)
    }

    var runtime = performance.now() - script_start_time;
    log("Runtime:  " + runtime.toFixed(2) + " ms")
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

function getRootDomain(url) {
    if (url.indexOf("//") > -1) {
        domain = url.split('/')[2].split(':')[0].split('?')[0];
    } else {
        domain = url.split('/')[0].split(':')[0].split('?')[0];
    }

    var splitArr = domain.split('.');
    var arrLen = splitArr.length;

    if (splitArr.length > 2) {
        domain = splitArr[splitArr.length - 2] + '.' + splitArr[splitArr.length - 1];
        if (splitArr[arrLen - 2].length == 2 && splitArr[arrLen - 1].length == 2) {
            domain = splitArr[arrLen - 3] + '.' + domain;
        }
    }
    return domain;
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

//Return: IMG, JS, CSS;
function getResources(){
    var resourceList = window.performance.getEntriesByType("resource");
    var imgResource = [];
    var jsResource  = [];
    var cssResource = [];
    var neither     = []
    var not_added = 0

    for (i = 0; i < resourceList.length; i++) {
        var added = false;

        if ( (resourceList[i].initiatorType == "img") && 
        !(resourceList[i].name.match(/[.](css|js)$/)) &&
        !(resourceList[i].name.match(/[.](css|js)[?].*$/))){
            added = true;
            imgResource.push( resourceList[i] );
        }

        //CSS detection
        if ( (resourceList[i].initiatorType == "link") || 
            ((resourceList[i].initiatorType == "css")) ||
            (resourceList[i].name.match(/[.](css)/)) ) { 
            if (added) log("Re-added as CSS "+i+": " + resourceList[i].initiatorType + ": " + resourceList[i].name);
            added = true;
            cssResource.push( resourceList[i] );
        }

        if ((resourceList[i].initiatorType == "script")) //|| (resourceList[i].name.match(/[.](js)$/))
        {
            if (added) log("Re-added as JS "+i+": " + resourceList[i].initiatorType + ": " + resourceList[i].name);
            added = true;
            jsResource.push( resourceList[i] );
        }

        if (added == false){
            //log("Not added: " + resourceList[i].initiatorType + ": " + resourceList[i].name);
            not_added+=1;
            neither.push ( resourceList[i] )
        }
    }
    
    log("num_res:          " + resourceList.length)
    log("num_img:          " + imgResource.length);
    log("num_css:          " + jsResource.length);
    log("num_js:           " + cssResource.length);
    log("num_others:       " + not_added);

    return [imgResource, jsResource, cssResource, neither];
}

function calcWebMetrics(jsResource, cssResource, stats){
    var t = performance.timing;

    stats.domstart = t.domContentLoadedEventStart - t.navigationStart;
    stats.dom      = t.domContentLoadedEventEnd   - t.navigationStart;
    if (t.loadEventEnd> 1000){
        stats.plt      = t.loadEventEnd - t.navigationStart;
    } else {
        stats.plt      = Date.now() - t.navigationStart;
    }
    stats.last_js  = 0.0;
    stats.last_css = 0.0;

    for (var i=0; i<jsResource.length; i++){
        var loadtime = jsResource[i].responseEnd;
        if (loadtime > stats.last_js) stats.last_js = loadtime;
    }

    for (var i=0; i<cssResource.length; i++){
        var loadtime = cssResource[i].responseEnd;
        if (loadtime > stats.last_css) stats.last_css = loadtime;
    }

    stats.atf = Math.max( stats.last_img, stats.last_css );
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
        
        rect             = imgs[i].getBoundingClientRect();
        imgd.x           = rect.x
        imgd.y           = rect.y
        imgd.top         = rect.top
        imgd.bottom      = rect.bottom
        imgd.left        = rect.left
        imgd.right       = rect.right
        imgd.width       = rect.width
        imgd.height      = rect.height

        imgd.loadtime    = getParameterOrNull(imgs[i],'loadtime');
        imgd.onscreen    = getParameterOrNull(imgs[i],'onscreen');
        imgd.screen_area = getParameterOrNull(imgs[i],'screen_area');
        
        imglist.push(imgd);
    }
    
    stats.imgs = imglist;
}

function writeObjToFile(object, filename){
    log("Saving object to file: " + filename, "DEBUG");
    var blob = new Blob([JSON.stringify(object)], {type: "text/plain;charset=utf-8"});
    saveAs(blob, filename);
}

console.log('ATF chrome plugin loaded')
