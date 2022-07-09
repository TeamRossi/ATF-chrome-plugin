while(true) {
    var break_loop = false;
    chrome.storage.sync.get({
        stats: {},
        filename: '',
        send_to_server: true,
        server_address: 'http://146.164.47.233:19282',
    }, function(items) {
        var stats = items.stats;
        var filename = items.filename;
        var sendToServer = items.send_to_server;
        var serverAddress = items.server_address;

        if (!sendToServer || serverAddress === '') {
            break_loop = true;
            return;
        }

        if (Object.keys(stats).length > 0) {
            var xhr = new XMLHttpRequest();

            try {
                xhr.open("POST", serverAddress + "/" + filename, true);
                xhr.setRequestHeader("Content-type", "application/json");
                xhr.send(JSON.stringify(obj));
            } catch (e) {
                console.error('Upload server not reachable.');
            }

            chrome.storage.sync.set({
                stats: {},
                filename: '',
            }, function() {});
        }
        
        setTimeout(function(){}, 1000);
    
    });
}