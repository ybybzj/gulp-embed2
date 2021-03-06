/*
  reorient-css
  https://github.com/callumlocke/reorient-css

  MIT licence
  Copyright 2014 Callum Locke
*/


// Imports
var path = require('path');
var parse = require('url').parse;
var postcss = require('postcss');
var datauri = require('datauri');

// Regex to find the URLs within a CSS property value
// Fiddle: http://refiddle.com/by/callum-locke/match-multiple-urls-within-a-css-property-value
// Railroad: http://goo.gl/vQzMcg
var urlMatcher = /url\(\s*['"]?([^)'"]+)['"]?\s*\)/g;


// Helpers
function relative(from, to) {
  // this is based on the POSIX-only version of path.relative() from Node source

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
}

function dirname(path) {
  var parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

function isFileRelativeURL(url) {
  var parsed = parse(url);

  return !(
    (url.indexOf('//') === 0) ||
    (parsed.protocol === 'data:') ||
    (parsed.host) ||
    (parsed.pathname.charAt(0) === '/')
  );
}

function resolve(url) {
  // this normalises any "../" in URL paths
  var parts = url.split('/');

  var newParts = [];
  var started = false;
  parts.forEach(function (part) {
    if (part !== '..') {
      started = true;
      newParts.push(part);
    }
    else {
      if (started) newParts.pop();
      else newParts.push(part);
    }
  });

  return newParts.join('/');
}

function getRoute(to, from) {
  from = from.split('/');
  to   = to.split('/');

  while (from.length && to.length) {
    if (from[0] === to[0]) {
      from.shift();
      to.shift();
    }
    else break;
  }

  from = from.join('/');
  to   = to.join('/');

  var route = relative(dirname(to), dirname(from));

  return route;
}


// Exports
module.exports = function reorientCSS(css, from, to, options) {
  // Normalise args
  if (typeof from === 'object') {
    options = from;
    from = options.from;
    to = options.to;
  }
  if (!options){
    options = {};
    options.from = from;
    options.to = to;
  }

  // Validate input
  if (typeof css !== 'string')  throw new TypeError('reorient-css: expected "css" to be a string.');
  if (typeof from !== 'string') throw new TypeError('reorient-css: expected "from" to be a string.');
  if (typeof to !== 'string')   throw new TypeError('reorient-css: expected "to" to be a string.');

  // Normalise to Unix-style paths
  from = from.replace(/\\/g, '/');
  to = to.replace(/\\/g, '/');

  // Establish relative route back to original location
  var route = getRoute(to, from);

  // See if this relocation is from one HTML file to another (ie, both in <style> elements)
  var htmlToHTML = (
    path.extname(from) === '.html' &&
    path.extname(to) === '.html'
  );

  // Process
  return postcss(function (css) {
    if (route === '') return;

    css.eachDecl(function (decl) {
      
      // Skip if this one is a `behavior` property (except if we're relocating
      // from one HTML file to another)
      if (!htmlToHTML && decl.prop === 'behavior') return;

      // Edit URLs
      var oldValue = decl.value;
      var newValue = oldValue.replace(urlMatcher, function(urlFunc, justURL) {
        if (isFileRelativeURL(justURL)){
          if(options.embedUrl === true || typeof options.embedUrl === 'string' && needEmbedded(options.embedUrl, justURL)){
            return urlFunc.replace(justURL, embedResource(justURL, from));
          }
          if(typeof options.resolveUrl === 'function'){
            return urlFunc.replace(justURL, options.resolveUrl(justURL, from, to));
          } 
          return urlFunc.replace(justURL, resolve(route + '/' + justURL));
        }

        return urlFunc;
      });

      if (newValue !== oldValue) decl.value = newValue;
    });
  }).process(css, options);
};
//helpers
function embedResource(resourceURL, cssFilePath){
  var resourcePath = path.resolve(path.dirname(cssFilePath), resourceURL);
  return datauri(resourcePath);
}

function needEmbedded(extStr, resourceURL){
  extStr = extStr.trim().split(/\s*,+\s*/).map(function(part){return part.trim();}).filter(Boolean);
  if(extStr.length === 0) return false;
  var ext = path.extname(resourceURL);
  if(ext[0] === '.') ext = ext.substr(1);
  return extStr.indexOf(ext) !== -1;
}