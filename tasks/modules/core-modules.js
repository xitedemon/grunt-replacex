'use strict';
// Load Required Modules
var path = require('path');
var fs = require('fs');
var chalk = require('chalk');
var _ = require('lodash');
var Applause = require('@forks_master/applause');
var fileSyncCmp = require('file-sync-cmp');
var isWindows = process.platform === 'win32';
var RegexParser = require("regex-parser");
const util = require('util');
module.exports = function (grunt) {
	var modules = {};
	var _REGEX_INC_STATEMENTS = /@(?:include|require)\(('|")(.*)('|")\);/gmi;
	var _REGEX_INC_PATHS = /@(?:include|require)\((?:'|")(.*)('|")\);/mi;
	var options;
	var applause;
	var _MASTER=null;
	var _DATA={};
	modules.init = function (options) {
		this.setOptions(options);
		this.createApplause();
	};
	modules.setOptions = function (opts) {
		options = opts;
	};
	modules.getCwd = function () {
		return this.toUnixPath(process.cwd());
	};
	modules.toUnixPath = function (filepath) {
		if (isWindows) {
			return filepath.replace(/\\/g, '/');
		}
		return filepath;
	};
	modules.getPathAbsolute = function (filepath, basepath=null) {
		if(basepath === null){
			basepath = this.getCwd();
		}
		return this.toUnixPath(path.resolve(basepath, filepath));
	};
	modules.getBasePath = function (full_absolute_path) {
		return path.dirname(full_absolute_path);
	};
	modules.getDestinationType = function (destination) {
		if (_.endsWith(destination, '/')) {
			return 'directory';
		}else{
			return 'file';
		}
	};
	modules.syncTimestamp = function (source, destination) {
		var stat = fs.lstatSync(source);
		if (path.basename(source) !== path.basename(destination)) {return;}
		if (stat.isFile() && !fileSyncCmp.equalFiles(source, destination)) {return;}
		var fd = fs.openSync(destination, isWindows ? 'r+' : 'r');
		fs.futimesSync(fd, stat.atime, stat.mtime);
		fs.closeSync(fd);
	};
	modules.getFileContent = function (filepath, basepath=null) {
		var realpath;
		var options = {
			encoding: 'utf8'
		};
		if (grunt.file.isPathAbsolute(filepath)){
			realpath = this.toUnixPath(filepath);
		}else{
			if(basepath === null){
				realpath = this.getPathAbsolute(filepath);
			}else{
				realpath = this.getPathAbsolute(filepath, basepath);
			}
		}

		if (grunt.file.isFile(realpath)) {
			return grunt.file.read(realpath, options);
		}
		return false;
	};
	modules.createApplause = function () {
		applause = Applause.create(_.extend({}, options, {}));
	};
	modules.warnNoMatched = function (tally) {
		if (options.silent !== true) {
			var count = 0;
			var patterns = options.patterns;
			patterns.forEach(function(pattern) {
				if (pattern.builtin !== true) { // exclude builtins
					var found = _.find(tally.details, ['source', pattern]);
					if (!found) {
						count++;
					}
				}
			});
			if (count > 0) {
				var strWarn = [
					'Unable to match ',
					count,
					count === 1 ? ' pattern' : ' patterns'
				];
				if (applause.options.usePrefix === true) {
					strWarn.push(
						', remember for simple matches (String) we are using the prefix ',
						applause.options.prefix,
						' for replacement lookup'
					);
				}
				strWarn.push(
					'.'
				);
				if (options.pedantic === true) {
					grunt.fail.warn(strWarn.join(''));
				} else {
					grunt.log.warn(strWarn.join(''));
				}
			}
			var str = [
				tally.replacements,
				tally.replacements === 1 ? ' replacement' : ' replacements',
				' in ',
				tally.files,
				tally.files === 1 ? ' file' : ' files',
				'.'
			];
			grunt.log.ok(str.join(''));
		}
	};
	modules.syncAll = function (directories) {
		if (options.timestamp) {
			Object.keys(directories).sort(function(a, b) {
				return b.length - a.length;
			}).forEach(function(dest) {
				corem.syncTimestamp(directories[dest], dest);
			});
		}
	};
	modules.escapeRegExString = function (string) {
		// $& means the whole matched string
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	};
	modules.log = function (data) {
		console.log(util.inspect(data, false, null, true));
	};
	modules.doReplace = function (content, match, replace) {
		match = '/'+match+'/gmi';
		match = this.escapeRegExString(match);
		match = RegexParser(match);
		return content.replace(match, replace);
	};
	modules.getFilePathFromStatement = function (statement) {
		return statement.match(_REGEX_INC_PATHS)[1];
	};
	modules.getIncludeStatements = function (content) {
		return content.match(_REGEX_INC_STATEMENTS);
	}
	modules.isFileExist = function(filepath){
		if(grunt.file.isFile(filepath)){
			return true;
		}
		return false;
	};
	modules.getBuildContent = function (source) {
		function getSourceListObject(source, base=null, object) {
			var filePath = modules.getPathAbsolute(source, base);
			var basePath = modules.getBasePath(filePath);
			if(object === null){
				// Define Object
				object = {};
				object.name = "MAIN";
				object.file = filePath;
			}
			if (modules.isFileExist(filePath)) {
				var fileContent = modules.getFileContent(filePath);
				var fileStatement = modules.getIncludeStatements(fileContent);
				if(fileStatement && fileStatement.length > 0){
					object.content = fileContent;
					object.error = false;
					object.nesting = true;
					object.statements = {};
					fileStatement.forEach(function (value) {
						object.statements[value] = {};
						var _subPathPar = modules.getFilePathFromStatement(value);
						var _subPath = modules.getPathAbsolute(_subPathPar, basePath);
						var _subBase = modules.getBasePath(_subPath);
						if(modules.isFileExist(_subPath)){
							object.statements[value].name = value;
							object.statements[value].file = _subPath;
							if(!(_DATA.hasOwnProperty(_subPath))){
								var _subContent = modules.getFileContent(_subPath);
								var _subStatements = modules.getIncludeStatements(_subContent);
								if(_subStatements && _subStatements.length > 0){
									getSourceListObject(_subPath, _subBase, object.statements[value]);
								}else{
									object.statements[value].content = null;
									object.statements[value].nesting = false;
									object.statements[value].error = false;
									_DATA[_subPath] = _subContent;
								}
							}else{
								object.statements[value].content = null;
								object.statements[value].error = false;
								object.statements[value].nesting = false;
							}
						}else{
							object.statements[value].name = value;
							object.statements[value].error = "FILE_NOT_EXIST";
							object.statements[value].nesting = false;
							object.statements[value].content = "";
						}
					});
				}else{
					object.nesting = false;
					object.error = false;
					object.content = null;
					_DATA[filePath] = fileContent;
				}
			}else{
				object.error = "FILE_NOT_EXIST";
				object.nesting = false;
				object.content = "";
			}
			return object;
		}
		function contentReplace(main_content, replace_content, replace_statement) {
			return modules.doReplace(main_content, replace_statement, replace_content);
		}
		var sourceObjectList = getSourceListObject(source, null, _MASTER);
		function replaceContentListObject(object) {
			var object_main = object;
			var content_main = object_main.content;
			if(object_main.nesting){
				for (let key in object_main.statements) {
					if (object_main.statements.hasOwnProperty(key)) {
						if(object_main.statements[key].nesting){
							var content_sub = replaceContentListObject(object_main.statements[key]);
							content_main = contentReplace(content_main, content_sub, object_main.statements[key].name);
						}else{
							if(object_main.statements[key].error){
								content_main = contentReplace(content_main, "", object_main.statements[key].name);
							}else if(object_main.statements[key].content === null){
								content_main = contentReplace(content_main, _DATA[object_main.statements[key].file], object_main.statements[key].name);
							}else{
								content_main = contentReplace(content_main, object_main.statements[key].content, object_main.statements[key].name);
							}
						}
					}
				}
			}else{
				return _DATA[object.file];
			}
			return content_main;
		}
		return replaceContentListObject(sourceObjectList);
	};
	modules.replace = function (source, target) {
		var res;
		var newContent = this.getBuildContent(source);
		grunt.file.copy(source, target, {
			encoding: options.encoding,
			process: function(content) {
				res = applause.replace(newContent, [source, target]);
				var result = res.content;
				var count = res.count;
				// force contents
				if (count === 0) {
					// no matches
					if (options.force === true) {
						result = newContent;
					} else {
						// ignore copy
						result = false;
					}
				}
				if (result !== false) {
					grunt.verbose.writeln('Replace ' + chalk.cyan(source) + ' → ' +
						chalk.green(target));
				}
				return result;
			},
			noProcess: options.noProcess
		});
		return res;
	};
	return modules;
};