
function save_options() {
  console.log('saving...');
  var verbosity          = document.getElementById('verbosity').value;
  var save_file          = document.getElementById('save_file').value;
  var send_to_server     = true;
  var server_address     = 'http://146.164.47.233:19282';
  var delay              = document.getElementById('delay').value;
  var hard_deadline      = document.getElementById('hard_deadline').value;
  var mac                = '00:00:00:00:00:00';

  chrome.storage.sync.set({
    verbosity: verbosity,
    save_file: save_file,
    send_to_server: send_to_server,
    server_address: server_address,
    delay: delay,
    hard_deadline: hard_deadline,
    mac: mac
  }, function() {
    // Update status to let user know options were saved.
    var status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(function() {
      status.textContent = '';
    }, 750);
  });

  console.log('SAVED');
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
  console.log("restoring")
  // Use default value color = 'red' and likesColor = true.
  chrome.storage.sync.get({
    verbosity: 'OUTPUT',
    save_file: 0,
    send_to_server: true,
    server_address: 'http://146.164.47.233:19282', 
    delay: 1000,
    hard_deadline: 10000,
    mac: '00:00:00:00:00:00'
  }, function(items) {
    document.getElementById('verbosity').value      = items.verbosity;
    document.getElementById('save_file').value      = items.save_file;
    document.getElementById('send_to_server').value = items.send_to_server;
    document.getElementById('server_address').value = items.server_address;
    document.getElementById('delay').value          = items.delay;
    document.getElementById('hard_deadline').value  = items.hard_deadline;
    document.getElementById('mac').value            = items.mac;
  });
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click',
    save_options);