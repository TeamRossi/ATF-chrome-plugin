/**
 * @Authors: Diego da Hora
 *           Alemnew Asrese
 *           Daniel Atkinson
 * @emails:  diego.hora@gmail.com
 *           alemnew.asrese@aalto.fi
 *           danatkhoo@gmail.com
 * @date:   2017-05-30
 */

/*
    PLUGIN configuration options
*/
var VERBOSITY='OUTPUT';      //DEBUG, WARNING, OUTPUT (default)
var savePageProfile=0;       //0:Nothing, 1:Save statistics, 2:Stats + Page profile, 3:Stats + Page profile + Timing, 4:Full log
var sendToServer=false;      //Default = false
var serverAddress='';        //Default = ''
var delay_to_calculate=1000; //In milliseconds
var hard_deadline=20000;     //Default = 20s
var version = 1.40;
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
        send_to_server: false,
        server_address: '',
        delay: 4000,
        hard_deadline: 10000
    }, function(items) {
        VERBOSITY          = items.verbosity;
        savePageProfile    = items.save_file;
        sendToServer       = items.send_to_server;
        serverAddress      = items.server_address;
        delay_to_calculate = items.delay;
        hard_deadline      = items.hard_deadline;
        log("Options -> Verbosity: " + VERBOSITY + ', save: ' + savePageProfile +
            (sendToServer) ? ', server address: ' + serverAddress : + '' + 
            ', delay: ' + delay_to_calculate + ', deadline: '+hard_deadline, "DEBUG")
        
        //Schedule execution: HARD_DEADLINE option
        setTimeout(function(){ 
            log("hard deadline execution. Already executed? " + executed, "DEBUG")
            calculateATF() 
        }, hard_deadline);

        //Schedule execution: ONLOAD option
        // window.addEventListener("load", function(event) { 
        //     log("window onload execution. Already executed? " + executed, "DEBUG")
        //     setTimeout(function(){
        //         calculateATF()
        //     }, delay_to_calculate);
        // });
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


function getRectangles(timings){
    var rects = []
    //Walk through all DOM elements
    var elements = document.getElementsByTagName('*');
    var re = /url\(.*(http.*)\)/ig;

    var addRectangle = function(el, url){
        rectObj = el.getBoundingClientRect();
        rect = {}
        rect.x           = rectObj.x
        rect.y           = rectObj.y
        rect.top         = rectObj.top
        rect.bottom      = rectObj.bottom
        rect.left        = rectObj.left
        rect.right       = rectObj.right
        rect.width       = rectObj.width
        rect.height      = rectObj.height
        rect.src = url;
        rect.tagName = el.tagName;
        rect.onscreen = intersectRect(rect, screenRect);
        rect.screen_area = overlapRect(screenRect, rect);
        key = geturlkey(rect.src)
        if (key in timings){
            rect.load_time = timings[key];
        } else {
            rect.load_time = 0.0;
        }
        rects.push(rect)
    }

    for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        var style = window.getComputedStyle(el);

        // check for Images
        if (el.tagName == 'IMG') {
            addRectangle(el, el.src);
            continue;
        } 
        // Check for background images
        if (style['background-image']) {
            re.lastIndex = 0;
            //Background images have this set to 'url("http://(something)")'
            var matches = re.exec(style['background-image']); 
            if (matches && matches.length > 1){
                addRectangle(el, matches[1].replace('"', ''));
            }
        }
    }
    return rects;
}

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
    stats.first_paint    = GetFirstPaint(window);
    stats.ii_plt         = index_metric(resources, stats.dom, stats.plt, metric='image');
    stats.ii_atf         = index_metric(resources, stats.dom, stats.atf, metric='image');
    stats.oi_plt         = index_metric(resources, stats.dom, stats.plt, metric='object');
    stats.oi_atf         = index_metric(resources, stats.dom, stats.atf, metric='object');
    stats.bi_plt         = index_metric(resources, stats.dom, stats.plt, metric='bytes');
    stats.bi_atf         = index_metric(resources, stats.dom, stats.atf, metric='bytes');
    stats.si_rum         = RUMSpeedIndex();

    var body = document.body;
    var html = document.documentElement;
    stats.page_height   = Math.max( body.scrollHeight, body.offsetHeight, 
                       html.clientHeight, html.scrollHeight, html.offsetHeight );
    stats.page_width    = Math.max( body.scrollWidth, body.offsetWidth, 
                       html.clientWidth, html.scrollWidth, html.offsetWidth );

    var tags = ['img', 'map', 'area', 'canvas', 'figcaption', 'figure', 'picture', 'audio', 'source', 'track', 'video', 'object', 'a']

    if(savePageProfile>=2) stats.timing         = t;
    if(savePageProfile>=1) {
        imageProfile(imgs, stats); 
        var timings = {};
        var resources = window.performance.getEntriesByType("resource");
        for (i =0; i<resources.length; i++){
            key = geturlkey(resources[i].name);
            timings[key] = resources[i].responseEnd;
        }
        stats.rects = getRectangles(timings);
    }
    if(savePageProfile>=3) stats.resources      = window.performance.getEntries();

    //Printing results    
    log("Img pixels:       " + img_pixels, "DEBUG");
    log("distinct_imgs:    " + Object.keys(hashImgs).length);
    log("num_atf_img:      " + screenimgs.length)
    log("image-page ratio: " + page_img_ratio.toFixed(2));
    log("page_width        " + stats.page_width.toFixed(2) )
    log("page_height       " + stats.page_height.toFixed(2) )
    log("right             " + stats.right.toFixed(2) )
    log("bottom            " + stats.bottom.toFixed(2) )
    log("total_kbytes      " + stats.total_bytes.toFixed(2) )
    log("num_origins       " + stats.total_bytes.toFixed(2) )
    log("first_paint:      " + stats.first_paint.toFixed(2))
    log("II_plt:           " + stats.ii_plt.toFixed(2))
    log("II_atf:           " + stats.ii_atf.toFixed(2))
    log("OI_plt:           " + stats.oi_plt.toFixed(2))
    log("OI_atf:           " + stats.oi_atf.toFixed(2))
    log("BI_plt:           " + stats.bi_plt.toFixed(2))
    log("BI_atf:           " + stats.bi_atf.toFixed(2))
    log("SI_rum:           " + stats.si_rum.toFixed(2))
    log("ATF_img:          " + stats.last_img.toFixed(2) )
    log("JS:               " + stats.last_js.toFixed(2) )
    log("CSS:              " + stats.last_css.toFixed(2) )
    log("ATF:              " + stats.atf.toFixed(2) )
    log("PLT:              " + stats.plt.toFixed(2) )

    var pageurl = geturlkey(window.location.toString());
    var filename  = "profile_"+pageurl+"_"+t+".json";
        
    var obj = {}
    obj[pageurl] = stats;

    stats.runtime      = performance.now() - script_start_time;

    if (sendToServer && serverAddress !== '') {
        var xhr = new XMLHttpRequest();

        try {
            xhr.open("POST", serverAddress + "/" + filename, true);
            xhr.setRequestHeader("Content-type", "application/json");
            xhr.send(jsonString);
            xhr.onreadystatechange = function () {
                if (xhr.readyState == XMLHttpRequest.DONE && xhr.status == 200) {
                    console.log("Upload server response: " + xhr.responseText);
                }
            }
        } catch (e) {
            console.error('Upload server not reachable.');
        }
    }

    if (savePageProfile>0){
        writeObjToFile(obj, filename)
    }

    runtime = performance.now() - script_start_time;
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

    stats.atf = Math.max( stats.last_img, stats.last_css ); //Not including JS times for now
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

//MIT LICENSE
function writeObjToFile(object, filename){
    log("Saving object to file: " + filename, "DEBUG");
    var blob = new Blob([JSON.stringify(object)], {type: "text/plain;charset=utf-8"});
    saveAs(blob, filename);
}

// Get the first paint time.
var firstPaint;
function GetFirstPaint(win) {
    // Try the standardized paint timing api
    try {
        var entries = performance.getEntriesByType('paint');
        for (var i = 0; i < entries.length; i++) {
            if (entries[i]['name'] == 'first-paint') {
                navStart = performance.getEntriesByType("navigation")[0].startTime;
                firstPaint = entries[i].startTime - navStart;
                break;
            }
        }
    } catch(e) {
    }
    // If the browser supports a first paint event, just use what the browser reports
    if (firstPaint === undefined && 'msFirstPaint' in win.performance.timing)
        firstPaint = win.performance.timing.msFirstPaint - navStart;
    if (firstPaint === undefined && 'chrome' in win && 'loadTimes' in win.chrome) {
        var chromeTimes = win.chrome.loadTimes();
        if ('firstPaintTime' in chromeTimes && chromeTimes.firstPaintTime > 0) {
            var startTime = chromeTimes.startLoadTime;
            if ('requestTime' in chromeTimes)
                startTime = chromeTimes.requestTime;
            if (chromeTimes.firstPaintTime >= startTime)
                firstPaint = (chromeTimes.firstPaintTime - startTime) * 1000.0;
        }
    }
    // For browsers that don't support first-paint or where we get insane values,
    // use the time of the last non-async script or css from the head.
    if (firstPaint === undefined || firstPaint < 0 || firstPaint > 120000) {
        firstPaint = win.performance.timing.responseStart - navStart;
        var headURLs = {};
        var headElements = doc.getElementsByTagName('head')[0].children;
        for (var i = 0; i < headElements.length; i++) {
            var el = headElements[i];
            if (el.tagName == 'SCRIPT' && el.src && !el.async)
                headURLs[el.src] = true;
            if (el.tagName == 'LINK' && el.rel == 'stylesheet' && el.href)
                headURLs[el.href] = true;
        }
        var requests = win.performance.getEntriesByType("resource");
        var doneCritical = false;
        for (var j = 0; j < requests.length; j++) {
            if (!doneCritical && headURLs[requests[j].name] &&
               (requests[j].initiatorType == 'script' || requests[j].initiatorType == 'link')) {
                var requestEnd = requests[j].responseEnd;
                if (firstPaint === undefined || requestEnd > firstPaint)
                    firstPaint = requestEnd;
            } else {
                doneCritical = true;
            }
        }
    }
    firstPaint = Math.max(firstPaint, 0);
    return firstPaint;
}

//RUM SPEED INDEX
var RUMSpeedIndex = function(win) {
  win = win || window;
  var doc = win.document;
    
  /****************************************************************************
    Support Routines
  ****************************************************************************/
  // Get the rect for the visible portion of the provided DOM element
  var GetElementViewportRect = function(el) {
    var intersect = false;
    if (el.getBoundingClientRect) {
      var elRect = el.getBoundingClientRect();
      intersect = {'top': Math.max(elRect.top, 0),
                       'left': Math.max(elRect.left, 0),
                       'bottom': Math.min(elRect.bottom, (win.innerHeight || doc.documentElement.clientHeight)),
                       'right': Math.min(elRect.right, (win.innerWidth || doc.documentElement.clientWidth))};
      if (intersect.bottom <= intersect.top ||
          intersect.right <= intersect.left) {
        intersect = false;
      } else {
        intersect.area = (intersect.bottom - intersect.top) * (intersect.right - intersect.left);
      }
    }
    return intersect;
  };

  // Check a given element to see if it is visible
  var CheckElement = function(el, url) {
    if (url) {
      var rect = GetElementViewportRect(el);
      if (rect) {
        rects.push({'url': url,
                     'area': rect.area,
                     'rect': rect});
      }
    }
  };

  // Get the visible rectangles for elements that we care about
  var GetRects = function() {
    // Walk all of the elements in the DOM (try to only do this once)
    var elements = doc.getElementsByTagName('*');
    var re = /url\(.*(http.*)\)/ig;
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var style = win.getComputedStyle(el);

      // check for Images
      if (el.tagName == 'IMG') {
        CheckElement(el, el.src);
      }
      // Check for background images
      if (style['background-image']) {
        re.lastIndex = 0;
        var matches = re.exec(style['background-image']);
        if (matches && matches.length > 1)
          CheckElement(el, matches[1].replace('"', ''));
      }
      // recursively walk any iFrames
      if (el.tagName == 'IFRAME') {
        try {
          var rect = GetElementViewportRect(el);
          if (rect) {
            var tm = RUMSpeedIndex(el.contentWindow);
            if (tm) {
              rects.push({'tm': tm,
                          'area': rect.area,
                          'rect': rect});
            }
        }
        } catch(e) {
        }
      }
    }
  };

  // Get the time at which each external resource loaded
  var GetRectTimings = function() {
    var timings = {};
    var requests = win.performance.getEntriesByType("resource");
    for (var i = 0; i < requests.length; i++)
      timings[requests[i].name] = requests[i].responseEnd;
    for (var j = 0; j < rects.length; j++) {
      if (!('tm' in rects[j]))
        rects[j].tm = timings[rects[j].url] !== undefined ? timings[rects[j].url] : 0;
    }
  };

  // Sort and group all of the paint rects by time and use them to
  // calculate the visual progress
  var CalculateVisualProgress = function() {
    var paints = {'0':0};
    var total = 0;
    for (var i = 0; i < rects.length; i++) {
      var tm = firstPaint;
      if ('tm' in rects[i] && rects[i].tm > firstPaint)
        tm = rects[i].tm;
      if (paints[tm] === undefined)
        paints[tm] = 0;
      paints[tm] += rects[i].area;
      total += rects[i].area;
    }
    // Add a paint area for the page background (count 10% of the pixels not
    // covered by existing paint rects.
    var pixels = Math.max(doc.documentElement.clientWidth, win.innerWidth || 0) *
                 Math.max(doc.documentElement.clientHeight, win.innerHeight || 0);
    if (pixels > 0 ) {
      pixels = Math.max(pixels - total, 0) * pageBackgroundWeight;
      if (paints[firstPaint] === undefined)
        paints[firstPaint] = 0;
      paints[firstPaint] += pixels;
      total += pixels;
    }
    // Calculate the visual progress
    if (total) {
      for (var time in paints) {
        if (paints.hasOwnProperty(time)) {
          progress.push({'tm': time, 'area': paints[time]});
        }
      }
      progress.sort(function(a,b){return a.tm - b.tm;});
      var accumulated = 0;
      for (var j = 0; j < progress.length; j++) {
        accumulated += progress[j].area;
        progress[j].progress = accumulated / total;
      }
    }
  };

  // Given the visual progress information, Calculate the speed index.
  var CalculateSpeedIndex = function() {
    if (progress.length) {
      SpeedIndex = 0;
      var lastTime = 0;
      var lastProgress = 0;
      for (var i = 0; i < progress.length; i++) {
        var elapsed = progress[i].tm - lastTime;
        if (elapsed > 0 && lastProgress < 1)
          SpeedIndex += (1 - lastProgress) * elapsed;
        lastTime = progress[i].tm;
        lastProgress = progress[i].progress;
      }
    } else {
      SpeedIndex = firstPaint;
    }
  };

  /****************************************************************************
    Main flow
  ****************************************************************************/
  var rects = [];
  var progress = [];
  var firstPaint;
  var SpeedIndex;
  var pageBackgroundWeight = 0.1;
  try {
    var navStart = win.performance.timing.navigationStart;
    GetRects();
    GetRectTimings();
    firstPaint = GetFirstPaint(win);
    CalculateVisualProgress();
    CalculateSpeedIndex();
  } catch(e) {
  }
  /* Debug output for testing
  var dbg = '';
  dbg += "Paint Rects\n";
  for (var i = 0; i < rects.length; i++)
    dbg += '(' + rects[i].area + ') ' + rects[i].tm + ' - ' + rects[i].url + "\n";
  dbg += "Visual Progress\n";
  for (var i = 0; i < progress.length; i++)
    dbg += '(' + progress[i].area + ') ' + progress[i].tm + ' - ' + progress[i].progress + "\n";
  dbg += 'First Paint: ' + firstPaint + "\n";
  dbg += 'Speed Index: ' + SpeedIndex + "\n";
  console.log(dbg);
  */
  return SpeedIndex;
};


console.log('ATF chrome plugin loaded')
