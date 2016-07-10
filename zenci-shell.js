/**
 * Originaly based on ssh2shell package but adjusted for Zen.CI project.
 * credit: https://github.com/cmp-202/ssh2shell
 * Author: http://github.com/Gormartsen
 */
"use strict";

var EventEmitter = require("events").EventEmitter;
var bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
var extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; }
var hasProp = {}.hasOwnProperty;

var ZENCIShell = (function(superClass) {
    extend(ZENCIShell, superClass);

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

    /**
     * Timeout event handler.
     *   Emit 'commandTimeout' event if timeout happend.
     *    - _notice object with last command details.
     *    - _stream ssh2-stream object
     *    - connection ssh2 object
     */
    ZENCIShell.prototype._timedout = function() {
      var _notice = {
        'command': this.command,
        'status': 1, //Set status to 1 as failed to timed out command.
        'time': new Date().getTime() - this._start_time,
        'output': this._buffer
      }
      this._notices[this.command] = _notice;
      return this.emit('commandTimeout', _notice, this._stream, this.connection);
    };

    /**
     * Process output from stream.
     *   Emit 'commandProcessing' event if command did not finish yet.
     *    - _notice object with last command details.
     *    - sshObj - settings for this class.
     *    - _stream ssh2-stream object
     */
    ZENCIShell.prototype._processData = function(data) {
      this._buffer += data;
      if (this.standardPromt.test(this._buffer)) {
        if (this.sshObj.debug) {
          this.emit('msg', this.sshObj.server.host + ": normal prompt");
        }
        // -13 is a length of hardcoded PS1 + COMMAND_PROMPT.
        if(this._buffer.length >= 13){
          this._buffer = this._buffer.substr(0, this._buffer.length - 13);
        }
        //cut out cmd line from buffer.
        if(this.command.length +2 <= this._buffer.length) {
          this._buffer =  this._buffer.substr(this.command.length + 2);
        }
        if(this.command == 'echo -e "$?"' ) {
          this._status = parseInt(this._buffer);
        }
        return this._processNextCommand();
      } else {
        var _notice = {
          'command': this.command,
          'status': this._status,
          'time': new Date().getTime() - this._start_time,
          'output': this._buffer
        }
        this.emit('commandProcessing', _notice, this.sshObj, this._stream);
        if (this._idleTimer) {
          clearTimeout(this._idleTimer);
        }
        return this._idleTimer = setTimeout(this._timedout, this._idleTime);
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
      if (this._status === -1 && this.command !== '' && this.command !== 'echo -e "$?"' ) {
        this._origin_command = this.command;
        this._origin_command_output = this._buffer;
        this._total_time = new Date().getTime() - this._start_time;
        this.command = 'echo -e "$?"';
        this._buffer = "";
        return this._runCommand();
      }
      if(this.command === 'echo -e "$?"' ) {
        this.command = this._origin_command;
      }
      // we are receiving banner only when command is empty.
      if(this.command !== "") {
        var _notice = {
          'command': this.command,
          'status': this._status,
          'time': this._total_time,
          'output': this._origin_command_output
        }
        this._notices[this.command] = _notice;
        this.emit('commandComplete', _notice, this.sshObj);
      }
      if (this.sshObj.verbose) {
        this.emit('msg', this.sshObj.server.host + " verbose:" + this._buffer);
      }
      this._buffer = "";
      if (this.sshObj.commands.length > 0) {
        this.command = this.sshObj.commands.shift();
        this._status = -1;
        this._start_time = new Date().getTime();
        if (this.command) {
          return this._runCommand();
        } else {
          return this._runExit();
        }
      } else {
        return this._runExit();
      }
    };
    /**
     * Write command to stream.
     */
    ZENCIShell.prototype._runCommand = function() {
      if (this.sshObj.debug) {
        this.emit('msg', this.sshObj.server.host + ": next command: " + this.command);
      }
      return this._stream.write(this.command + "\n");
    };

    ZENCIShell.prototype._runExit = function() {
      this.command = "exit";
      if (this.sshObj.exitCommands && this.sshObj.exitCommands.length > 0) {
        if (this.sshObj.debug) {
          this.emit('msg', this.sshObj.server.host + ": Queued exit commands: " + this.sshObj.exitCommands);
        }
        this.command = this.sshObj.exitCommands.pop();
        return this._runCommand();
      } else {
        if (this.sshObj.debug) {
          this.emit('msg', "Exit and close connection on: " + this.sshObj.server.host);
        }
        return this._stream.end("exit\n");
      }
    };
    /**
     * Set default values for settings.
     */
    ZENCIShell.prototype._loadDefaults = function() {
      var ref;
      if (!this.sshObj.msg) {
        this.sshObj.msg = {
          send: (function(_this) {
            return function(message) {
              return false;
            };
          })(this)
        };
      }
      if (!this.sshObj.connectedMessage) {
        this.sshObj.connectedMessage = "Connected";
      }
      if (!this.sshObj.readyMessage) {
        this.sshObj.readyMessage = "Ready";
      }
      if (!this.sshObj.closedMessage) {
        this.sshObj.closedMessage = "Closed";
      }
      if (!this.sshObj.verbose) {
        this.sshObj.verbose = false;
      }
      if (!this.sshObj.debug) {
        this.sshObj.debug = false;
      }
      if (!this.sshObj.passphrasePromt) {
        this.sshObj.passphrasePromt = ":";
      }
      this.sshObj.exitCommands = [];
      this.sshObj.pwSent = false;
      this.sshObj.sshAuth = false;
      this._idleTime = (ref = this.sshObj.idleTimeOut) != null ? ref : 5000;
      this.passphrasePromt = new RegExp("password.*" + this.sshObj.passphrasePromt + "\\s?$", "i");
      return this.standardPromt = new RegExp("zencishell: $");
    };
    /**
     * Object constructor.
     */
    function ZENCIShell(sshObj1) {
      this.sshObj = sshObj1;
      this.connect = bind(this.connect, this);
      this._loadDefaults = bind(this._loadDefaults, this);
      this._runExit = bind(this._runExit, this);
      this._runCommand = bind(this._runCommand, this);
      this._processNextCommand = bind(this._processNextCommand, this);
      this._processData = bind(this._processData, this);
      this._timedout = bind(this._timedout, this);
      this._loadDefaults();
      this.connection = new require('ssh2')();
      this.on("connect", (function(_this) {
        return function() {
          return _this.emit('msg', _this.sshObj.connectedMessage);
        };
      })(this));
      this.on("ready", (function(_this) {
        return function() {
          return _this.emit('msg', _this.sshObj.readyMessage);
        };
      })(this));
      this.on("msg", (function(_this) {
        return function(message) {
          if (_this.sshObj.msg) {
            return _this.sshObj.msg.send(message);
          }
        };
      })(this));
      this.on('commandProcessing', (function(_this) {
        return function(notice, sshObj, stream) {
          if (_this.sshObj.onCommandProcessing) {
            return _this.sshObj.onCommandProcessing(notice, sshObj, stream);
          }
        };
      })(this));
      this.on('commandComplete', (function(_this) {
        return function(notice, sshObj) {
          if (_this.sshObj.onCommandComplete) {
            return _this.sshObj.onCommandComplete(notice, sshObj);
          }
        };
      })(this));
      this.on('commandTimeout', (function(_this) {
        return function(notice, stream, connection) {
          if (_this.sshObj.onCommandTimeout) {
            return _this.sshObj.onCommandTimeout(notice, stream, connection);
          } else {
            return _this.emit("error", _this.sshObj.server.host + ": Command timed out after " + (_this._idleTime / 1000) + " seconds", "Timeout", true, function(err, type) {
              return _this._buffer;
            });
          }
        };
      })(this));
      this.on('end', (function(_this) {
        return function(notices, sshObj) {
          if (_this.sshObj.onEnd) {
            return _this.sshObj.onEnd(notices, sshObj);
          }
        };
      })(this));
      this.on("close", (function(_this) {
        return function(had_error) {
          if (_this.sshObj.onClose) {
            _this.sshObj.onClose(had_error);
          }
          if (had_error) {
            return _this.emit("error", had_error, "Close");
          } else {
            return _this.emit('msg', _this.sshObj.closedMessage);
          }
        };
      })(this));
      this.on("error", (function(_this) {
        return function(err, type, close, callback) {
          if (close == null) {
            close = false;
          }
          if (_this.sshObj.onError) {
            _this.sshObj.onError(err, type, close);
          }
          _this.emit('msg', (type + " error: ") + err);
          if (callback) {
            callback(err, type);
          }
          if (close) {
            return _this.connection.end();
          }
        };
      })(this));
    }
    /**
     * Init ssh2 connection.
     * by using export we setup our own prompt to detect when command finished.
     *   Emit 'onEnd' event if command finished,
     *    - _notices array of notice objects with command status.
     *    - sshObj - settings for this class.
     */
    ZENCIShell.prototype.connect = function() {
      var e, error, ref, ref1;
      if (this.sshObj.server && this.sshObj.commands) {
        try {
          this.connection.on("connect", (function(_this) {
            return function() {
              return _this.emit("connect");
            };
          })(this));
          this.connection.on("ready", (function(_this) {
            return function() {
              _this.emit("ready");
              return _this.connection.shell({'cols': 1000, 'modes': {'ECHO': 53}},function(err, _stream) {
                _this._stream = _stream;
                if (err) {
                  _this.emit('error', err, "Shell", true);
                }
                _this._stream.write("export PS1='zencishell: ';export PROMPT_COMMAND='echo -n \"_\"' ; sleep 1\n");
                _this._stream.on("error", function(err) {
                  return _this.emit('error', err, "Stream");
                });
                _this._stream.stderr.on('data', function(data) {
                  return _this.emit('stderr', data, "Stream STDERR");
                });
                _this._stream.on("readable", function() {
                  var data, e, error, results;
                  try {
                    results = [];
                    while ((data = _this._stream.read())) {
                      results.push(_this._processData("" + data));
                    }
                    return results;
                  } catch (error) {
                    e = error;
                    return _this.emit('error', e + " " + e.stack, "Processing response:", true);
                  }
                });
                _this._stream.on("end", function() {
                  return _this.emit('end', _this._notices, _this.sshObj);
                });
                return _this._stream.on("close", function(code, signal) {
                  if (_this._idleTimer) {
                    clearTimeout(_this._idleTimer);
                  }
                  return _this.connection.end();
                });
              });
            };
          })(this));
          this.connection.on("error", (function(_this) {
            return function(err) {
              return _this.emit("error", err, "Connection", true);
            };
          })(this));
          this.connection.on("close", (function(_this) {
            return function(had_error) {
              return _this.emit("close", had_error);
            };
          })(this));
          return this.connection.connect({
            host: this.sshObj.server.host,
            port: this.sshObj.server.port,
            username: this.sshObj.server.userName,
            password: this.sshObj.server.password,
            privateKey: (ref = this.sshObj.server.privateKey) != null ? ref : "",
            passphrase: (ref1 = this.sshObj.server.passPhrase) != null ? ref1 : ""
          });
        } catch (error) {
          e = error;
          return this.emit('error', e + " " + e.stack, "Connect:", true);
        }
      } else {
        return this.emit('error', "Missing connection parameters", "Parameters", false, missingParameters(err, type, close)(function() {
          this.emit('msg', this.sshObj.server);
          return this.emit('msg', this.sshObj.commands);
        }));
      }
    };

    return ZENCIShell;

  })(EventEmitter);

module.exports = ZENCIShell;
