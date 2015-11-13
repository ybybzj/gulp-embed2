###
  resource-embedder2 modified by vajoylarn
###

fs = require 'graceful-fs'
path = require 'path'
htmlparser = require 'htmlparser2'
assign = require('lodash').assign
Resource = require './resource'
getLineIndent = require './get-line-indent'
parseFileSize = require './parse-file-size'

defaults =
  threshold: '5KB'
  stylesheets: true
  images: false
  scripts: true
  deleteEmbeddedFiles: false

indentEachLine = (str, indent) ->
  lines = str.split '\n'
  indent + lines.join "\n#{indent}"

openTag = (tag)->
  switch tag
    when 'script', 'style'
      "<#{tag}>"
    when 'img'
      "<#{tag} src=\""
closeTag = (tag)->
  switch tag
    when 'script', 'style'
      "</#{tag}>"
    when 'img'
      "\">"

module.exports = class ResourceEmbedder
  constructor: (_options) ->
    # Normalise arguments
    if typeof _options is 'string'
      htmlFile = arguments[0]
      _options = arguments[1] || {}
      _options.htmlFile = htmlFile
    
    # Build options
    @options = assign {}, defaults, _options
    @options.htmlFile = path.resolve @options.htmlFile
    if not @options.assetRoot
      @options.assetRoot = path.dirname(@options.htmlFile) unless @options.assetRoot?
    @options.assetRoot = path.resolve @options.assetRoot
    if typeof @options.threshold isnt 'number'
      @options.threshold = parseFileSize @options.threshold

  get: (callback) ->
    fs.readFile @options.htmlFile, (err, inputMarkup) =>
      throw err if err

      inputMarkup = inputMarkup.toString()
      embeddableResources = {}
      tagCounter = 1
      finished = false
      isDoEmbeddingExecuted = false
      isEmbeddableExecuted = 1
      warnings = []

      doEmbedding = =>
        # console.log embeddableResources
        for own k, er of embeddableResources
          console.log !er.body? || !er.elementEndIndex? if er.type is 'img'
          return if !er.body? || !er.elementEndIndex?
        outputMarkup = ''
        index = 0
        for own k, er of embeddableResources
          er.body = er.body.toString()
          isAble = (er.body isnt '<!--disable-->')

          multiline = (er.body.indexOf('\n') isnt -1)
          if multiline
            indent = getLineIndent er.elementStartIndex, inputMarkup
          else indent = ''

          body = (if indent.length then indentEachLine(er.body, indent) else er.body)

          outputMarkup += (
            inputMarkup.substring(index, er.elementStartIndex) +
            (if isAble then "#{openTag(er.type)}" else "") +
            (if multiline then '\n' else '') +
            body +
            (if multiline then '\n' else '') +
            indent + (if isAble then "#{closeTag(er.type)}" else "")
          )
          index = er.elementEndIndex + 1
          
          if @options.deleteEmbeddedFiles && fs.existsSync er.path
            fs.unlinkSync er.path
        outputMarkup += inputMarkup.substring index

        callback outputMarkup, (if warnings.length then warnings else null)

      parser = new htmlparser.Parser
        onopentag: (tagName, attributes) =>
          # console.log "onopentag"
          tagCounter++
          thisTagId = tagCounter
          startIndexOfThisTag = parser.startIndex
          resource = new Resource tagName, attributes, @options
          
          doEmbeddingExecuted = true if finished
          resource.isEmbeddable (embed) =>
            if embed
              if !embeddableResources[thisTagId]?
                embeddableResources[thisTagId] = {}
              er = embeddableResources[thisTagId]
              er.body = (if embed is 'disable' then '<!--disable-->' else resource.contents)
              er.type = (switch tagName 
                when 'script', 'img' 
                  tagName 
                when 'link'
                  'style'
                )
              er.path = path.resolve path.join(@options.assetRoot, resource.target)
              er.elementStartIndex = startIndexOfThisTag
            else
              warnings.push resource.warning if resource.warning?
              process.nextTick -> delete embeddableResources[thisTagId]
            isEmbeddableExecuted++
            if finished
              isDoEmbeddingExecuted = true
              process.nextTick doEmbedding

        onclosetag: (tagName) ->
          # console.log "onclosetag"
          switch tagName
            when 'script', 'link', 'img'
              if !embeddableResources[tagCounter]?
                embeddableResources[tagCounter] = {}
              er = embeddableResources[tagCounter]
              er.elementEndIndex = parser.endIndex
          if finished
            throw new Error 'Should never happen!'

        onend: ->
          # console.log "onend"
          finished = true
          # console.log "isEmbeddableExecuted: #{isEmbeddableExecuted}|tagCounter: #{tagCounter}"
          if isDoEmbeddingExecuted is false and isEmbeddableExecuted is tagCounter
            isDoEmbeddingExecuted = true
            process.nextTick doEmbedding
      parser.write(inputMarkup)
      parser.end()

