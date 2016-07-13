# zenci-shell
![NPM](https://nodei.co/npm/zenci-shell.png?downloads=true&&downloadRank=true&stars=true)


Wrapper class for Node.js [ssh2](https://www.npmjs.org/package/ssh2) shell command for running multiple commands

This package was originaly based on https://github.com/cmp-202/ssh2shell. Please check it first, maybe you do not need extra features provided by zenci-shell.



Since **v0.2** it was completely rewrited and has different functionality now.
*This class enables the following functionality:*

* Run multiple commands sequentially.
* Callback with object that contain command name, status and output. Ability to add new command to command list based on output.
* Time tracking per each command.
* Status from command.
* Respond contain only command output.



Installation:
------------
```
npm install zenci-shell
```


Requirements:
------------
The class expects an object with the following structure to be passed to its constructor:
```javascript
//Host object
host = {
  server:              {       
    host:         "IP Address",
    port:         "external port number",
    userName:     "user name",
    password:     "user password",
    passPhrase:   "privateKeyPassphrase", //optional string
    privateKey:   require('fs').readFileSync('/path/to/private/key/id_rsa'), //optional string
    keep_alive:   false //optional string. Do not close SSH connection and wait for new commands to run.
  },
  commands:           ["Array", "of", "strings", "command"], //array() of command strings. IF keep_alive is true, this is optional.
  idleTimeOut:         5000,        //optional number in milliseconds
  idleCommandTime:    100,         //optional how often check for new commands in queue
}; 
```

Minimal Example:

```javascript
/**
 * Simple list example.
 * see file example/simple.js
 */
"use strict";
var ZENCIShell = require ('zenci-shell');

var host = {
  server:        {
    host:         "localhost",
    userName:     "test",
    password:     'test'
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
```


Usage:
======

Connecting to a single host:
----------------------------

*How to:*
* Use an .env file for server values loaded by dotenv from the root of the project.
* Connect using a key pair with passphrase.
* Set commands.
* Test the response of a command and add more commands and notifications in the host.onCommandComplete event handler.
* Use the two notification types in the commands array.


*.env*
```
HOST=192.168.0.1
PORT=22
USER_NAME=myuser
PASSWORD=mypassword
PRIV_KEY_PATH=~/.ssh/id_rsa
PASS_PHRASE=myPassPhrase
```

*app.js*
```javascript
var dotenv = require('dotenv');
dotenv.load();
var ZENCIShell = require ('zenci-shell');

var host = {
  server:              {     
    host:         process.env.HOST,
    port:         process.env.PORT,
    userName:     process.env.USER_NAME,
    password:     process.env.PASSWORD,
    passPhrase:   process.env.PASS_PHRASE,
    privateKey:   require('fs').readFileSync(process.env.PRIV_KEY_PATH)
  },
  commands:      [
    "echo $(pwd)",
    "cd ~/",
    "ls -l",
    "echo $(pwd)",
    "ls -l",
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

SSH.exec("top -n 3", function(notice) {
  console.log(notice);
  if(notice.status >= 0 ){
    SSH.end();
  }
})

```


Trouble shooting:
-----------------

* Recheck your passphrase for typos or missing chars.
* Try connecting manually to the host using the exact passhrase used by the code to confirm it works.
* If your password is incorrect the connection will return an error.
* There is an optional debug setting via ENV vars. in the host object that will output progress information when set to true and passwords for failed authentication of sudo commands and tunnelling. `DEBUG=ssh:* node example/simple.js`
* The class now has an idle time out timer (default:5000ms) to stop unexpected command prompts from causing the process hang without error. The default time out can be changed by setting the host.idleTimeOut with a value in milliseconds. (1000 = 1 sec)


Authentication:
---------------
* When using key authentication you may require a valid passphrase if your key was created with one. 



Verbose and Debug:
------------------
 `DEBUG=ssh:* node example/simple.js`

There is 3 levels of debug info:

- ssh:events - print events that happening inside package. Like connected, ready, command sent etc
- ssh:raw - pring raw respond from server
- ssh:*-print events and raw respond from server



Event Handlers:
---------------
By using `SSH.exec(command, function (notice) { // some action. })` 

You can specify custom callback to handle next action based on output. All commands are running in sequential mode. So you can call SSH.exec without waiting for respond if needed.

*Further reading:* [node.js event emitter](http://nodejs.org/api/events.html#events_class_events_eventemitter)

**Class Instance Event Definitions:**

```javascript
zenci-shell.on ("connect", function onConnect() { 
 //default: debug.events output Connected
});

zenci-shell.on ("ready", function onReady() { 
 //default: debug.events output Ready
});

zenci-shell.on ("commandComplete", function onCommandComplete( notice ) { 
 //default: debug.events output "Command %s finished in %s ms with status %s"
   // notice is object with next properties
   //   command: is the command being run
   //   status: command exit code.
   //   time: time in miliseconds. This is how long last command was running for.
   //   output: final output from command from start to end. Exclude command echo and shell prompt.
});

zenci-shell.on ("commandProcessing", function onCommandComplete( notice ) { 
 //default: debug.events output "Command %s is still runnung for %s ms"
   // notice is object with next properties
   //   command: is the command being run
   //   status: -1
   //   time: time in miliseconds. This is for how long this command is running for.
   //   output: current output from command. Exclude command echo and shell prompt.
});

zenci-shell.on ("end", function onEnd( notices ) { 
 //default: debug.evens output End 
 //notices is array of all command objects.
});

zenci-shell.on ("close", function onClose(err) { 
 //default: debug.evens output Close 
 //err: new Error object if closed by error

});

zenci-shell.on ("error", function onError(err, type) {
 //default: debug.evens output Error type: % message: % 
 //err is the error message received
 //type is a string identifying the source of the error
});
```



Check example directory for example usage.