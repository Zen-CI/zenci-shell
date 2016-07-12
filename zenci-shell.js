/**
 * Originaly based on ssh2shell package but adjusted for Zen.CI project.
 * credit: https://github.com/cmp-202/ssh2shell
 * Author: http://github.com/Gormartsen
 */
"use strict";

const EventEmitter = require( "events" ).EventEmitter;
const util = require("util");
const bind = function( fn, me ) { return function() { return fn.apply( me, arguments ); }; };

/**
 * Object constructor.
 */
function ZENCIShell( sshObj1 ) {
  EventEmitter.call(this);
  this.sshObj = sshObj1;
  this.connect = bind( this.connect, this );
  this.end = bind( this.end, this );
  this._loadDefaults = bind( this._loadDefaults, this );
  this._runCommand = bind( this._runCommand, this );
  this._processNextCommand = bind( this._processNextCommand, this );
  this._processData = bind( this._processData, this );
  this._timedout = bind( this._timedout, this );
  this._command_timeout = bind( this._command_timeout, this );
  this._loadDefaults();
  this.connection = new require( "ssh2" )();

  // Use a closure to preserve `this`
  var self = this;

  // Attach Events.
  this.on( "connect", function() {
    return self.emit( "msg", self.sshObj.connectedMessage );
  });

  this.on( "ready", function() {
    return self.emit( "msg", self.sshObj.readyMessage );
  });


  this.on( "msg", function( message ) {
    if ( self.sshObj.msg ) {
      return self.sshObj.msg.send( message );
    }
  });

  this.on( "commandProcessing", function( notice, sshObj, stream ) {
    if ( self.sshObj.onCommandProcessing ) {
      return self.sshObj.onCommandProcessing( notice, sshObj, stream );
    }
  });

  this.on( "commandComplete", function( notice, sshObj ) {
    if ( self.sshObj.onCommandComplete ) {
      return self.sshObj.onCommandComplete( notice, sshObj );
    }
  });

  this.on( "commandTimeout", function( notice, stream, connection ) {
    if ( self.sshObj.onCommandTimeout ) {
      return self.sshObj.onCommandTimeout( notice, stream, connection );
    } else {
      return self.emit( "error", self.sshObj.server.host + ": Command timed out after " + ( _this._idleTime / 1000 ) + " seconds", "Timeout", true, function( err, type ) {
        return self._buffer;
      } );
    }
  });

  this.on( "end", function( notices, sshObj ) {
    if ( self.sshObj.onEnd ) {
      return self.sshObj.onEnd( notices, sshObj );
    }
  });

  this.on( "close", function( had_error ) {
    if ( self.sshObj.onClose ) {
      if ( self._status == -1 ) {
        had_error = true;
      }
      self.sshObj.onClose( had_error, self.command );
    }
    if ( had_error ) {
      return self.emit( "error", had_error, "Close" );
    } else {
      return self.emit( "msg", self.sshObj.closedMessage );
    }
  });

  this.on( "error", function( err, type, close, callback ) {
    if ( close == null ) {
      close = false;
    }
    if ( self.sshObj.onError ) {
      self.sshObj.onError( err, type, close );
    }
    self.emit( "msg", ( type + " error: " ) + err );
    if ( callback ) {
      callback( err, type );
    }
    if ( close ) {
      return self.connection.end();
    }
  });
}

util.inherits(ZENCIShell, EventEmitter);

ZENCIShell.prototype.sshObj = {};

ZENCIShell.prototype.command = "";

ZENCIShell.prototype._origin_command = "";

ZENCIShell.prototype._origin_command_output = "";

ZENCIShell.prototype._notices = [];

ZENCIShell.prototype._status = -1;

ZENCIShell.prototype._start_time = 0;

ZENCIShell.prototype._total_time = 0;

ZENCIShell.prototype._stream = {};

ZENCIShell.prototype._data = "";

ZENCIShell.prototype._buffer = "";

ZENCIShell.prototype._callback = function () { return FALSE; };

/**
 * Timeout event handler.
 *   Emit 'commandTimeout' event if timeout happend.
 *    - _notice object with last command details.
 *    - _stream ssh2-stream object
 *    - connection ssh2 object
 */
ZENCIShell.prototype._timedout = function() {
  this._notices[ this.command ] = {
    "command": this.command,
    "status": 1, //Set status to 1 as failed to timed out command.
    "time": new Date().getTime() - this._start_time,
    "output": this._buffer
  };
  return this.emit( "commandTimeout", this._notices[ this.command ], this._stream, this.connection );
};

/**
 * Timeout event handler.
 *   Emit 'commandTimeout' event if timeout happend.
 *    - _notice object with last command details.
 *    - _stream ssh2-stream object
 *    - connection ssh2 object
 */
ZENCIShell.prototype._command_timeout = function() {
  this._processNextCommand();
};

/**
 * Process output from stream.
 *   Emit 'commandProcessing' event if command did not finish yet.
 *    - _notice object with last command details.
 *    - sshObj - settings for this class.
 *    - _stream ssh2-stream object
 */
ZENCIShell.prototype._processData = function( data ) {
  this._buffer += data;
  // Check for login prompt to know if command finished.
  if ( this.standardPromt.test( this._buffer ) ) {
    if ( this.sshObj.debug ) {
      this.emit( "msg", this.sshObj.server.host + ": normal prompt" );
    }

    // -13 is a length of hardcoded PS1 + COMMAND_PROMPT.
    if ( this._buffer.length >= 13 ) {
      this._buffer = this._buffer.substr( 0, this._buffer.length - 13 );
    }

    // Cut out cmd line from buffer.
    if ( this.command.length + 2 <= this._buffer.length ) {
      this._buffer =  this._buffer.substr( this.command.length + 2 );
    }

    // Check for status command.
    if ( this.command == 'echo -e "$?"' ) {
      this._status = parseInt( this._buffer );
      this.command = this._origin_command;
      if(this.command != '') {
        this._notices[ this.command ] = {
          "command": this.command,
          "status": this._status,
          "time": this._total_time,
          "output": this._origin_command_output
        };
        this.emit( "commandComplete", this._notices[ this.command ], this.sshObj );
        this.callback(this._notices[ this.command ]);
      }
      return this._processNextCommand();
    }

    // If command finished (promt is here) and it is not a echo -e "$?"
    // We need to start echo -e "$?" to get status.
    this._origin_command = this.command;
    this._origin_command_output = this._buffer;
    this._total_time = new Date().getTime() - this._start_time;
    this.command = 'echo -e "$?"';
    this._buffer = "";
    return this._runCommand();

  } else {
    // Command is still running.
    if(this.command != '') {
      var _notice = {
        "command": this.command,
        "status": this._status,
        "time": new Date().getTime() - this._start_time,
        "output": this._buffer
      };
      this.emit( "commandProcessing", _notice, this.sshObj, this._stream );
      this.callback(_notice);
    }

    // Update timeout timer.
    if ( this._idleTimer ) {
      clearTimeout( this._idleTimer );
    }
    return this._idleTimer = setTimeout( this._timedout, this._idleTime );
  }
};

/**
 * Prepare to start next Command.
 *   Emit 'commandComplete' event if command finished,
 *    - _notice object with last command details.
 *    - sshObj - settings for this class.
 *   or start 'echo -e "$?"' to get latest comman status.
 */
ZENCIShell.prototype._processNextCommand = function() {
  this._buffer = "";
  if ( this.sshObj.commands.length > 0 ) {
    var nextCommand = this.sshObj.commands.shift();
    if(!nextCommand.callback){
      this.command = nextCommand;
      this.callback = function() { return false;};
    }
    else{
      this.command = nextCommand.command;
      this.callback = nextCommand.callback;
    }

    this._status = -1;
    this._start_time = new Date().getTime();
    if ( this.command ) {
      return this._runCommand();
    }
  }

  //clear default timeout
  if ( this._idleTimer ) {
    clearTimeout( this._idleTimer );
  }
  // Start waiting timer
  if ( this._idleCommandTimer ) {
    clearTimeout( this._idleCommandTimer );
  }
  if( this.sshObj.keep_alive) {
    return this._idleCommandTimer = setTimeout( this._command_timeout, this._idleCommandTime );
  }
  // if this is not keep alive mode, close connection.
  this.end();

};

/**
 * Write command to stream.
 */
ZENCIShell.prototype._runCommand = function() {
  if ( this.sshObj.debug ) {
    this.emit( "msg", this.sshObj.server.host + ": next command: " + this.command );
  }
  return this._stream.write( this.command + "\n" );
};

/**
 * Add command into commands pull.
 * @return bool TRUE if put in queue, FALSE if connection is not alive
 */
ZENCIShell.prototype.exec = function(command, callback ) {
  if(this.connection._sshstream.writable) {
    if(callback){
      this.sshObj.commands.push({
        command: command,
        callback: callback
      });
    } else {
      this.sshObj.commands.push(command);
    }
    return true;
  }
  return false;
}

/**
 * Close SSH connection.
 */
ZENCIShell.prototype.end = function() {
  if ( this.sshObj.debug ) {
    this.emit( "msg", "Exit and close connection on: " + this.sshObj.server.host );
  }
  if(this.connection._sshstream.writable) {
    this.command = "exit";
    this._stream.end( "exit\n" );
    return true;
  }
  return false;
}

/**
 * Set default values for settings.
 */
ZENCIShell.prototype._loadDefaults = function() {
  var ref;

  if ( !this.sshObj.connectedMessage ) {
    this.sshObj.connectedMessage = "Connected";
  }
  if ( !this.sshObj.readyMessage ) {
    this.sshObj.readyMessage = "Ready";
  }
  if ( !this.sshObj.closedMessage ) {
    this.sshObj.closedMessage = "Closed";
  }
  if ( !this.sshObj.verbose ) {
    this.sshObj.verbose = false;
  }
  if ( !this.sshObj.debug ) {
    this.sshObj.debug = false;
  }
  if ( !this.sshObj.keep_alive ) {
    this.sshObj.keep_alive = false;
  }
  this.sshObj.exitCommands = [];

  this._idleTime = ( ref = this.sshObj.idleTimeOut ) != null ? ref : 5000;
  this._idleCommandTime = ( ref = this.sshObj.idleCommandTimeOut ) != null ? ref : 100;
  return this.standardPromt = new RegExp( "zencishell: $" );
};

/**
 * Init ssh2 connection.
 * by using export we setup our own prompt to detect when command finished.
 *   Emit 'onEnd' event if command finished,
 *    - _notices array of notice objects with command status.
 *    - sshObj - settings for this class.
 */
ZENCIShell.prototype.connect = function() {
  var e, error, ref, ref1;
  var self = this;
  if ( this.sshObj.server && this.sshObj.commands ) {

      this.connection.on( "connect", function() {
        self.emit( "connect" );
      });

      this.connection.on( "ready", function() {
        self.emit( "ready" );
        return self.connection.shell( { "cols": 1000, "modes": { "ECHO": 53 } }, function( err, _stream ) {
          self._stream = _stream;
          if ( err ) {
            self.emit( "error", err, "Shell", true );
          }
          self._stream.write( "export PS1='zencishell: ';export PROMPT_COMMAND='echo -n \"_\"' ; sleep 1\n" );
          self._stream.on( "error", function( err ) {
            return self.emit( "error", err, "Stream" );
          } );
          self._stream.on( "data", function(data) {
            self._processData( "" + data );
          });
          self._stream.on( "end", function() {
            if ( self._status == -1 ) {
              self._notices[ self.command ] = {
                "command": self.command,
                "status": 1,
                "time": new Date().getTime() - self._start_time,
                "output": self._buffer
              };
            }
            return self.emit( "end", self._notices, self.sshObj );
          } );
          return self._stream.on( "close", function( code, signal ) {
            if ( self._idleTimer ) {
              clearTimeout( self._idleTimer );
            }
            return self.connection.end();
          } );
        } );
      });

      this.connection.on( "error", function(err) {
        self.emit( "error", err, "Connection", true );
      });

      this.connection.on( "close", function( had_error ) {
        self.emit( "close", had_error );
      });

      return this.connection.connect( {
        host: this.sshObj.server.host,
        port: this.sshObj.server.port,
        username: this.sshObj.server.userName,
        password: this.sshObj.server.password,
        privateKey: ( ref = this.sshObj.server.privateKey ) != null ? ref : "",
        passphrase: ( ref1 = this.sshObj.server.passPhrase ) != null ? ref1 : ""
      } );

  } else {
    return this.emit( "error", "Missing connection parameters", "Parameters", false, missingParameters( err, type, close )( function() {
      this.emit( "msg", this.sshObj.server );
      return this.emit( "msg", this.sshObj.commands );
    } ) );
  }
};


module.exports = ZENCIShell;
