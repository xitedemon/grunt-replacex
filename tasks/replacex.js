'use strict';
module.exports = function (grunt) {
  // Load Required Modules
  var path = require('path');
  var fs = require('fs');
  var chalk = require('chalk');
  var _ = require('lodash');
  var fileSyncCmp = require('file-sync-cmp');
  var isWindows = process.platform === 'win32';
  var corem = require('./modules/core-modules')(grunt);
  // Task Configuration
  var taskName = 'replacex';
  var taskDescription = 'Replace text patterns with replacex.';
  var taskFunction = function () {
    var options = this.options({
      encoding: grunt.file.defaultEncoding,
      process: false,
      noProcess: [],
      mode: false,
      timestamp: false,
      patterns: [],
      excludeBuiltins: false,
      force: true,
      silent: false,
      pedantic: false,
      prefix: '@@',
      usePrefix: true,
      preservePrefix: false,
      delimiter: '.',
      preserveOrder: false
    });
    // Attach Built-in Patterns
    var patterns = options.patterns;
    if (options.excludeBuiltins !== true) {
      patterns.push(
          {
            match: '__SOURCE_FILE__',
            replacement: function(match, offset, string, source) {
              return source;
            },
            builtin: true
          },
          {
            match: '__SOURCE_PATH__',
            replacement: function(match, offset, string, source) {
              return path.dirname(source);
            },
            builtin: true
          },
          {
            match: '__SOURCE_FILENAME__',
            replacement: function(match, offset, string, source) {
              return path.basename(source);
            },
            builtin: true
          },
          {
            match: '__TARGET_FILE__',
            replacement: function(match, offset, string, source, target) {
              return target;
            },
            builtin: true
          },
          {
            match: '__TARGET_PATH__',
            replacement: function(match, offset, string, source, target) {
              return path.dirname(target);
            },
            builtin: true
          },
          {
            match: '__TARGET_FILENAME__',
            replacement: function(match, offset, string, source, target) {
              return path.basename(target);
            },
            builtin: true
          }
      );
    }
    corem.init(options);
    // [Task Tracking]
    var isExpandedPair;
    var dirs = {};
    var tally = {
      dirs: 0,
      files: 0,
      replacements: 0,
      details: []
    };
    // Tasks Per Processing
    this.files.forEach(function(filePair) {
      isExpandedPair = filePair.orig.expand || false;
      filePair.src.forEach(function(src) {
        src = corem.toUnixPath(src);
        var dest = corem.toUnixPath(filePair.dest);
        if (corem.getDestinationType(dest) === 'directory') {
          dest = (isExpandedPair) ? dest : path.join(dest, src);
        }
        if(grunt.file.isDir(src)){
          grunt.file.mkdir(dest);
          if(options.mode !== false){
            fs.chmodSync(dest, (options.mode === true) ?
                fs.lstatSync(src).mode : options.mode);
          }
          if(options.timestamp){
            dirs[dest] = src;
          }
          tally.dirs++;
        }
        else{
          var res = corem.replace(src, dest);
          // TODO: detail will replaced by matches in applause 2.x
          tally.details = tally.details.concat(res.detail);
          tally.replacements += res.count;
          corem.syncTimestamp(src, dest);
          if (options.mode !== false) {
            fs.chmodSync(dest, (options.mode === true) ?
                fs.lstatSync(src).mode : options.mode);
          }
          tally.files++;
        }
        if (options.mode !== false) {
          fs.chmodSync(dest, (options.mode === true) ?
              fs.lstatSync(src).mode : options.mode);
        }

      });
    });
    // Sync TimeStamp
    corem.syncAll(dirs);
    // warn for unmatched patterns in the file list
    corem.warnNoMatched(tally);
  };
  grunt.registerMultiTask(taskName, taskDescription, taskFunction);
};