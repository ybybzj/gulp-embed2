
'use strict';
var path = require('path');
var gutil = require('gulp-util');
var through2 = require('through2');
var PluginError = gutil.PluginError;
var ResourceEmbedder = require('./lib/resource-embedder');

module.exports = function (options) {
    return through2.obj(function (file, enc, cb) {
        var filepath = file.path;
        //file not exsists
        if (file.isNull()) {
            this.emit('error', new PluginError('gulp-embed', 'File not found: "' + filepath + '"'));
            return cb();
        }

        var embedder = new ResourceEmbedder(filepath, options);
        embedder.get(function (markup) {
            // console.log(markup);
            file.contents = new Buffer(markup)
            this.push(file);
            cb();
        }.bind(this));

    });
};