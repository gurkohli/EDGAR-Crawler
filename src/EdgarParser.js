const _ = require('lodash');
const Entities = require('html-entities').AllHtmlEntities;
const xmlParser = require('fast-xml-parser');
const striptags = require('striptags');
const isHtml = require('is-html');

const entities = new Entities();

class EdgarParser {
  // https://stackoverflow.com/questions/432493
  // how-do-you-access-the-matched-groups-in-a-javascript-regular-expression
  getMatches(string, regex, index) {
    index || (index = 1); // default to the first capturing group
    var matches = [];
    var match;
    while (match = regex.exec(string)) {
      matches.push(match[index]);
    }
    return matches;
  }

  regexMultiLine(beginTag, endTag) {
    if (_.isNil(endTag)) {
      endTag = beginTag;
    }
    const regexString = `(?:<${beginTag}>.*\n)((?:.*[\n])+?)(?:<\/${endTag}>)`
    return new RegExp(regexString, 'gm');
  }

  regexSingleLine(tag) {
    const regexString = `(?:<${tag}>)(.*)`;
    return new RegExp(regexString, 'g');
  }

  regexSec(key) {
    const regexString = `(?:${key}:)(.*)`;
    return new RegExp(regexString, 'gm');
  }

  extractTextFromTags(text, regex, isReturnArray) {
    const matches = this.getMatches(text, regex);
    if (isReturnArray) {
      return matches;
    }
    return _.first(matches);
  }

  createMatchSelectors(text) {
    const multiLine = (beginTag, endTagOrReturnArr, isReturnArrayOrig) => {
      let endTag = endTagOrReturnArr;
      let isReturnArray = isReturnArrayOrig;
      if (_.isBoolean(endTagOrReturnArr)) {
        endTag = undefined;
        isReturnArray = endTagOrReturnArr;
      }
      const multiLineRegex = this.regexMultiLine(beginTag, endTag);
      return this.extractTextFromTags(text, multiLineRegex, isReturnArray);
    }

    const singleLine = (tag, isReturnArray) => {
      const singleLineRegex = this.regexSingleLine(tag);
      return this.extractTextFromTags(text, singleLineRegex, isReturnArray);
    }

    const sec = (key) => {
      const secRegex = this.regexSec(key);
      const matchedStr = this.extractTextFromTags(text, secRegex)
      if (_.isNil(matchedStr)) {
        return '';
      }
      return matchedStr.trim();
    }

    return { multiLine, singleLine, sec };
  }

  parseSecInfo(text) {
    const match = this.createMatchSelectors(text);
    const res = {
      filename: _.first(match.singleLine('SEC-DOCUMENT').split(' : ')),
      headerFilename: _.first(match.singleLine('SEC-HEADER').split(' : ')),
      acceptanceDateTime: match.singleLine('ACCEPTANCE-DATETIME'),
      accessionNumber: match.sec('ACCESSION NUMBER'),
      submissionType: match.sec('CONFORMED SUBMISSION TYPE'),
      documentCount: match.sec('PUBLIC DOCUMENT COUNT'),
      filingDate: match.sec('FILED AS OF DATE'),
    };

    const company = {
      name: match.sec('COMPANY CONFORMED NAME'),
      formerName: match.sec('FORMER CONFORMED NAME'),
      nameChangeDate: match.sec('DATE OF NAME CHANGE'),
      cik: match.sec('CENTRAL INDEX KEY'),
      classification: match.sec('STANDARD INDUSTRIAL CLASSIFICATION'),
      irsNumber: match.sec('IRS NUMBER'),
      stateOfIncorporation: match.sec('STATE OF INCORPORATION'),
      fiscalYearEnd: match.sec('FISCAL YEAR END'),
    };

    const filingDetails = {
      formType: match.sec('FORM TYPE'),
      fileNumber: match.sec('SEC FILE NUMBER'),
      filmNumber: match.sec('FILM NUMBER'),
    };

    return {
      ...res,
      company,
      filingDetails,
    };
  }

  isHTML(str) {
    var a = document.createElement('div');
    a.innerHTML = str;

    for (var c = a.childNodes, i = c.length; i--; ) {
      if (c[i].nodeType == 1) return true;
    }

    return false;
  }

  parseDocumentInfo(text) {
    const match = this.createMatchSelectors(text);
    const res = {
      documents: [],
    };
    const documents = match.multiLine('DOCUMENT', true);
    documents.forEach((document) => {
      const docMatch = this.createMatchSelectors(document);

      const texts = docMatch.multiLine('TEXT', true).join('\n');
      let pages = [];
      const isTextHTML = isHtml(texts);
      let xml = docMatch.multiLine('XML');
      const isTextXML = !_.isNil(xml)
      if (isTextHTML) {
        let parsedTexts = texts.replace(this.regexMultiLine('table.*'), '');
        parsedTexts = striptags(parsedTexts);
        parsedTexts = entities.decode(parsedTexts);
        pages = [parsedTexts.replace(/\n[\s]+/gm, '\n\n')];
      } else if (isTextXML) {
        xml = xml.replace(/<\?.*xml .*\?>\n/, '');
        if (xmlParser.validate(xml)) {
          const parsedXml = xmlParser.parse(xml);
          pages = [parsedXml]
        }
      } else {
        const pages = texts.split(this.regexSingleLine('PAGE')).slice(1);
      }
      const parsedDoc = {
        type: docMatch.singleLine('TYPE'),
        sequence: docMatch.singleLine('SEQUENCE'),
        filename: docMatch.singleLine('FILENAME'),
        description: docMatch.singleLine('DESCRIPTION'),
        pages: pages.filter(page => page !== ""),
        isXml: isTextXML,
        isHTML: isTextHTML,
      }
      res.documents.push(parsedDoc);
    });
    return res;
  }

  parseText(text) {
    return {
      ...this.parseSecInfo(text),
      ...this.parseDocumentInfo(text),
    }
  }
}

exports.EdgarParser = EdgarParser;
