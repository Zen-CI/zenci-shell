# zenci-shell
Wrapper class for Node.js [ssh2](https://www.npmjs.org/package/ssh2) shell command for running multiple commands

This class is based https://github.com/cmp-202/ssh2shell.
Please check it first, maybe you do not need extra features provided by zenci-shell.

*This class enables the following functionality:*
* Run multiple commands sequentially within the context of the previous commands result.
* Ability to respond to prompts resulting from a command as it is being run.
* Ability to check the last command and conditions within the response text before the next command is run.
* Performing actions based on command/response tests like adding or removing commands, processing of command response text.
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
  },
  commands:           ["Array", "of", "strings", "command"], //array() of command strings
  msg:                {
    send: function( message ) {
      //message handler code
	  console.log(message);
    }
  }, 
  verbose:             false,  //optional boolean
  debug:               false,  //optional boolean
  idleTimeOut:         5000,        //optional number in milliseconds
  connectedMessage:    "Connected", //optional string
  readyMessage:        "Ready",     //optional string
  closedMessage:       "Closed",    //optional string
  
  //optional event handlers defined for a host that will be called by the default event handlers
  //of the class
  onCommandProcessing: function( notice, sshObj, stream ) {
   //optional code to run during the procesing of a command 
   // notice is object with next properties
   //   command: is the command being run
   //   status: -1 on this phase
   //   time: result of `new Date().getTime()` when command has been started.
   //   output: current output for this command.
   //sshObj is this object and gives access to the current set of commands
   //stream object allows strea.write access if a command requires a response
  },
  onCommandComplete:   function( notice, sshObj ) {
   //optional code to run on the completion of a command
   // notice is object with next properties
   //   command: is the command being run
   //   status: exit code from processed command
   //   time: time in miliseconds. This is how long last command was running for.
   //   output: final output from command from start to end. Exclude command echo and shell prompt.
   //sshObj is this object and gives access to the current set of commands
  },
  onCommandTimeout:    function(notice, sshObj, stream, connection) {
   //optional code for responding to command timeout
   // notice is object with next properties
   //   command: is the command being run
   //   status: 1 because we interrupted this command.
   //   time: time in miliseconds. This is how long last command was running for.
   //   output: final output from command from start to end. Exclude command echo and shell prompt.
   //stream object used  to respond to the timeout without having to close the connection
   //connection object gives access to close the shell using connection.end()
  },
  onEnd:               function( notices, sshObj ) {
   //optional code to run at the end of the session
   //notices is array of all notices for each command.
  }
};
```

Minimal Example:

```javascript
var host = {
  server:        {     
    host:         "127.0.0.1",
    userName:     "test",
    password:     "1234",
  },
  commands:      [
    "echo $(pwd)",
    "ls -l"
  ],
  onEnd: function( notices, sshObj ) {
    console.log( "onEnd" );
    console.log( notices );
  }
};

//Create a new instance
var ZENCIShell = require ('zenci-shell'),
    SSH       = new ZENCIShell(host);

//Start the process
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
var Email = require('email');

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
 onCommandComplete: function( notice, sshObj ) {
  //confirm it is the root home dir and change to root's .ssh folder
  if (notice.command === "echo $(pwd)" && notice.output.indexOf("/root") != -1 ) {
   sshObj.commands.push("cd .ssh");
  }
  //we are listing the dir so output it to the msg handler
  else if (notice.command === "ls -l"){      
   console.log(notice.output);
  }
 },
 onEnd: function( notices, sshObj ) {
   console.log(notices);
 }
};

//Create a new instance
var ZENCIShell = require ('zenci-shell'),
    SSH       = new ZENCIShell(host);

//Start the process
SSH.connect();

```

Trouble shooting:
-----------------

* Recheck your passphrase for typos or missing chars.
* Try connecting manually to the host using the exact passhrase used by the code to confirm it works.
* If your password is incorrect the connection will return an error.
* There is an optional debug setting in the host object that will output progress information when set to true and passwords for failed authentication of sudo commands and tunnelling. `host.debug = true`
* The class now has an idle time out timer (default:5000ms) to stop unexpected command prompts from causing the process hang without error. The default time out can be changed by setting the host.idleTimeOut with a value in milliseconds. (1000 = 1 sec)

Authentication:
---------------
* When using key authentication you may require a valid passphrase if your key was created with one. 


Verbose and Debug:
------------------
* When verbose is set to true each command response raises a msg event (calls host.msg.send(message)) when the command completes.
* When debug is set to true in a host object process messages raises a msg event (calls host.msg.send(message)) to help identify what the internal process of each step was. 

Responding to command prompts:
----------------------
When running commands there are cases that you might need to respond to specific prompt that results from the command being run.
The command response check method is the same as in the example for the host.onCommandComplete event handler but in this case we use it in the host.onCommandProcessing event handler and stream.write to send the response. If you want to terminate the connection then se the 
The stream object is available in the host.onCommandProcessing event handler to output the response to the prompt directly as follows:

```javascript
//in the host object definition that will be used only for that host
host.onCommandProcessing = function( notice, sshObj, stream ) {
   //Check the command and prompt exits and respond with a 'y'
   if (notice.command == "apt-get install nano" && notice.output.indexOf("[y/N]?") != -1 ) {
     stream.write('y\n');
   }
 };
 
 // Alternativly you can use this one instead of defining in host.
 //This will be run in addition to any other handlers defined for this event
 zenci-shell.on ('commandProcessing', function onCommandProcessing( notice, sshObj, stream ) {
   //Check the command and prompt exits and respond with a 'y'
   if (notice.command == "apt-get install nano" && notice.output.indexOf("[y/N]?") != -1 ) {
     stream.write('y\n');
   }
 };

```
The other alternative is to use the host.onCommandTimeout event handler but it will be delayed by the idleTimout value

```javascript
host.onCommandTimeout = function( notice, sshObj, stream, connection ) {
   if (notice.output.indexOf("[y/N]?") != -1 ) {
     stream.write('n\n');
   }
 }
```
To terminate the session on such a prompt use connection.end() within the timeout event handler.


Event Handlers:
---------------
There are a number of event handlers that enable you to add your own code to be run when those events are triggered. You do not have to add event handlers unless you want to add your own functionality as the class already has default handlers defined. 

There are two ways to add event handlers:

1. Add handller functions to the host object (See Requirments) these event handlers will only be run for that host.
 * Connect, ready and close are not available for definition in the hosts object 
2. Add handlers to the class instance which will be run every time the event is triggered for all hosts.
 * The default event handlers of the class will call the host object event handler functions if they are defined.

**Note:** any event handlers you add to the class instance are run as well as any other event handlers defined for the same event.

*Further reading:* [node.js event emitter](http://nodejs.org/api/events.html#events_class_events_eventemitter)

**Class Instance Event Definitions:**

```javascript
zenci-shell.on ("connect", function onConnect() { 
 //default: outputs primaryHost.connectedMessage
});

zenci-shell.on ("ready", function onReady() { 
 //default: outputs primaryHost.readyMessage
});

zenci-shell.on ("msg", function onMsg( message ) {
 //default: outputs the message to the host.msg.send function. If undefined output mutted.
 //message is the text to ouput.
});

zenci-shell.on ("commandProcessing", function onCommandProcessing( notice, sshObj, stream )  { 
 //default: runs host.onCommandProcessing function if defined 
   // notice is object with next properties
   //   command: is the command being run
   //   status: -1 on this phase
   //   time: result of `new Date().getTime()` when command has been started.
   //   output: final output from command from start to end. Exclude command echo and shell prompt.
 //sshObj is the host object
 //stream is the session stream
});
    
zenci-shell.on ("commandComplete", function onCommandComplete( notice, sshObj ) { 
 //default: runs host.onCommandComplete function if defined 
   // notice is object with next properties
   //   command: is the command being run
   //   status: command exit code.
   //   time: time in miliseconds. This is how long last command was running for.
   //   output: final output from command from start to end. Exclude command echo and shell prompt.
 //sshObj is the host object
});
    
zenci-shell.on ("commandTimeout", function onCommandTimeout( notice, stream, connection ) { 
 //default: runs host.onCommandTimeout function if defined if not the buffer is added to sessionText
 //the error is outputed to the msg event and the connection is closed
 // notice is object with next properties
 //   command: is the command being run
 //   status: 1 because we interrupted this command.
 //   time: time in miliseconds. This is how long last command was running for.
 //   output: final output from command from start to end. Exclude command echo and shell prompt.
 //stream is the session stream
 //connection is the main ssh2 connection object
});

zenci-shell.on ("end", function onEnd( notices, sshObj ) { 
 //default: run host.onEnd function if defined 
 //notices  is array of all notices for each command.
 //sshObj is the host object for this session
});

zenci-shell.on ("close", function onClose(had_error) { 
 //default: outputs primaryHost.closeMessage or error if one was received
 //had_error indicates an error was recieved on close
});

zenci-shell.on ("error", function onError(err, type, close, callback) {
 //default: Outputs the error, runs the callback if defined and closes the connection
 //Close and callback should be set by default to close = false and callback = undefined
 //not all error events will pass those two parameters to the evnt handler.
 //err is the error message received
 //type is a string identifying the source of the error
 //close is a bollean value indicating if the error will close the session
 //callback a fuction that will be run by the default handler
});
```