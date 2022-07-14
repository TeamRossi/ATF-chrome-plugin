chrome.webRequest.onBeforeRequest.addListener(
    function () {
        setTimeout(sendData, 15000);
    },
    {urls: ["<all_urls>"]}
);

function sendData() {
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

        if (!sendToServer || serverAddress === '' || filename === '') {
            return;
        }

        if (Object.keys(stats).length > 0) {
            var xhr = new XMLHttpRequest();

            try {
                xhr.open("POST", serverAddress + "/" + filename, true);
                xhr.setRequestHeader("Content-type", "application/json");
                xhr.send(JSON.stringify(stats));
            } catch (e) {
                console.error('Upload server not reachable.');
            }

            chrome.storage.sync.set({
                stats: {},
                filename: '',
            }, function() {});
        }    
    });
}