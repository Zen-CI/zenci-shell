/**
 * Simple list example.
 */
"use strict";
var ZENCIShell = require ('../zenci-shell.js');

var host = {
  server:        {
    host:         "karma.vps-private.net",
    userName:     "test",
    password: 'test',
  },
  commands:      [
    "echo $(pwd)",
    "echo test"
  ],
};

// Create a new instance.
var SSH       = new ZENCIShell(host);

// Get command output when finished
SSH.on("end", function( command_log) {
  console.log(command_log);
});

// Start the process.
SSH.connect();
