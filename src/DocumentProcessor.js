const _ = require('lodash');
const fs = require('fs');
const syllable = require('syllable');
const nlp = require('compromise');

function filterOutEmpty(arr) {
	return _.filter(arr, elem => !_.isNil(elem) && !_.isEmpty(elem));
}

var positiveWordsArr = fs.readFileSync('./dicPositive.txt', 'utf-8').split('\n');
positiveWordsArr = filterOutEmpty(_.map(positiveWordsArr, word => _.lowerCase(word)));

var negativeWordsArr = fs.readFileSync('./dicNegative.txt', 'utf-8').split('\n');
negativeWordsArr = filterOutEmpty(_.map(negativeWordsArr, word => _.lowerCase(word)));


exports.processDoc = function processDoc(doc) {
	// Remove \n and more than two whitespace or dashes
	const sanitizedDoc = doc.replace(/\n+/igm, ' ').replace(/[\s-]{2,}/igm, ' ');
	const nlpObj = nlp(sanitizedDoc);

	const sentenceList = filterOutEmpty(
		_.map(nlpObj.sentences().data(), datum => datum.text)
	);

	const wordList = filterOutEmpty(
		_.map(nlpObj.words().data(), datum => datum.normal)
	);

	// var wordList = doc.replace(/['";:,.?¿\-!¡]+/g, '').match(/\S+/g);

	/* 1. Length
   * Measure of amount of disclosure
   * expressed as number of sentences within the annual report
   */
	const length = _.size(sentenceList);

	/* 2. Numerical Intensity
   * Count of non-date numbers contained within the text.
   * TODO TODO TODO
   */
	const numDigits = sanitizedDoc.match(/\d+(\.\d)?/gm).length;
	const dates = filterOutEmpty(
		_.map(nlpObj.dates().data(), datum => datum.text)
	);
	var numDates = 0;
	_.forEach(dates, date => {
		if (date.match(/\d/g)) {
			numDates++;
		}
	});
	const ni = numDigits - numDates;
	/* 3. Readablility
   * Fog index expressed in number of years of education required
   * to understand a passage of text.
   */

	// Word count of words with 3 or more syllables
	var higherSyllableWordCount = 0;
	var syllableCount = 0;
	_.forEach(wordList, (word, index) => {
		const sCount = syllable(word);
		syllableCount += sCount;
		if (sCount >= 3) {
			higherSyllableWordCount += 1;
		}
	});
	const wordCount = wordList.length;
	const sentenceCount = sentenceList.length;
	const fogIndex = 0.4 * ((wordCount/sentenceCount) + (100 * (higherSyllableWordCount/wordCount)));

	/* 4. Tone
   * Measure of optimism express as number of optimistic words
   * minus number of pessimistic words using Henry(2008) dictionary.
   */
	var posWordsInDoc = [];
	positiveWordsArr.forEach(posWord => {
		wordList.forEach(word => {
			if (word === posWord) {
				posWordsInDoc.push(word);
			}
		});
	});

	var negWordsInDoc = [];
	negativeWordsArr.forEach(negWord => {
		wordList.forEach(word => {
			if (word === negWord) {
				negWordsInDoc.push(word);
			}
		});
	});
	// const posWordsInDoc = _.intersection(positiveWordsArr, wordList);
	// const negWordsInDoc = _.intersection(negativeWordsArr, wordList);
	// console.log(negWordsInDoc)
	const tone = posWordsInDoc.length - negWordsInDoc.length;

	return {
		length,
		ni,
		fogIndex,
		tone,
		higherSyllableWordCount,
		wordList,
		wordCount,
		sentenceCount,
		sentenceList,
		syllableCount,
		negWordsInDoc,
		posWordsInDoc,
		nlpObj,
	};
};
