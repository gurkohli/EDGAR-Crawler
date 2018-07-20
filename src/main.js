const rp = require('request-promise');
const PromiseThrottle = require('promise-throttle');
const TagParser = require('tag-parser');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const nlp = require('compromise');
const json2csv = require('json2csv').parse;

const processor = require('./DocumentProcessor.js');
const EdgarParser = require('./EdgarParser.js').EdgarParser;
const EdgarDownloader = require('./EdgarDownloader.js').EdgarDownloader;

/* Constants */
const BATCH_SIZE = 2;
const FILE_PATH = path.resolve(path.join(__dirname, '..', 'results', 'result.csv'));
const FILE_PATH_BACKUP = path.resolve(path.join(__dirname, '..', 'results', 'result.csv.bak'));
const FIELDS = [
	{ label: 'CIK', value: 'company.cik', default: '' },
	{ label: 'Form Date', value: 'filingDate', default: '' },
	{ label: 'Form Type', value: 'filingDetails.formType', default: '' },
	{ label: 'Company Name', value: 'company.name', default: '' },
	{ label: 'SECF Name', value: 'identifier', default: '' },
	{ label: 'Filename', value: 'fileName', default: '' },
	{ label: 'Sentence Count', value: 'formMetrics.sentenceCount', default: '' },
	{ label: 'Word Count', value: 'formMetrics.wordCount', default: '' },
	{ label: 'Higher Syllable Word Count', value: 'formMetrics.higherSyllableWordCount', default: '' },
	{ label: 'Numerical Intensity', value: 'formMetrics.ni', default: '' },
	{ label: 'Fog Index', value: 'formMetrics.fogIndex', default: '' },
	{ label: 'Negative Words Count', value: 'formMetrics.negWordsInDoc.length', default: '' },
	{ label: 'Positive Words Count', value: 'formMetrics.posWordsInDoc.length', default: '' },
	{ label: 'Tone', value: 'formMetrics.tone' },
];
const HEADERS = json2csv({}, { fields: FIELDS });

/* Instances */
const parser = new EdgarParser();
const downloader = new EdgarDownloader();
const promiseThrottle = new PromiseThrottle({
	requestsPerSecond: 1,
	promiseImplementation: Promise,
});

/* Set up */
if (fs.existsSync(FILE_PATH)) {
	fs.renameSync(FILE_PATH, FILE_PATH_BACKUP);
}
const fileStream = fs.createWriteStream(FILE_PATH);
const csvParser = data => {
	let result = null;
	try {
		result = json2csv(data, { fields: FIELDS, header: false })
	} catch (error) {
		console.log('json2csv(ERROR): ', error);
	}
	return result;
}
const writeToFile = text => {
	if (text) {
		fileStream.write(text + '\n');
	}
}
writeToFile(HEADERS);

// Update promise.all to complete even with rejection
const reflect = promise => promise
	.then(result => ({ result, status: 'fulfilled' }))
	.catch(error => ({ error, status: 'rejected' }));
Promise.when = (promiseList) =>
	Promise.all(promiseList.map(reflect));

/* Main */
console.log('Getting list of forms from Edgar');
downloader.getFormsDownloaderForYearAndQuarter('2017', 'QTR3').then(forms => {
	const totalFormCount = forms.length;
	// let currentFormIndex = 0;
	const downloadForms = (currentBatch) => {
		console.log('        Downloading');
		const promiseList = currentBatch.map(form => {
			return promiseThrottle.add(form.downloadForm);
		});
		return Promise.when(promiseList).then(results => {
			const successful = results
				.filter(r => r.status === 'fulfilled')
				.map(r => r.result);
			const failed = results
				.filter(r => r.status === 'rejected')
				.map(r => r.error);
			return { successful, failed	};
		});
	};

	const processForms = (downloadedForms, currentBatch) => {
		console.log('        Processing');
		const successfulForms = downloadedForms.successful;
		return successfulForms.map((form, index) => {
			const rawForm = currentBatch[index];
			const parsedForm = parser.parseText(form);
			// const formType = parsedForm.submissionType;
			const mainDocument = parsedForm.documents[0];
			let formMetrics = null;
			if (!mainDocument.isXml) {
				const pages = _.join(mainDocument.pages, '\n') + '\n';
				const processed = processor.processDoc(pages);
				formMetrics = processed;
			}
			return {
				...parsedForm,
				formMetrics,
				...rawForm,
			};
		});
	};

	const saveData = (processedForms) => {
		console.log('        Saving');
		processedForms.forEach((form, index) => {
			if (form.formMetrics) {
				const csv = csvParser(form);
				writeToFile(csv);
				// console.log(csv);
			}
		})
		return true;
	};

	const batchedForms = downloader.batch(forms, BATCH_SIZE);
	let currentBatch = batchedForms.getCurrentBatch();
	const algorithm = () => {
		const currentIndex = batchedForms.getCurrentIndex();
		if (currentIndex === 0) {
			console.log(`List downloaded. Total forms: ${totalFormCount}`);
			console.log(`Processing in batches of size: ${BATCH_SIZE}`);
		} else {
			console.log(`Processed forms ${currentIndex}/${totalFormCount}`);
		}
		downloadForms(currentBatch)
			.then(downloadedForms => processForms(downloadedForms, currentBatch))
			.then(processedForms => saveData(processedForms, currentBatch))
			.then(shouldProcessNextBatch => {
				const shouldProceed = shouldProcessNextBatch && !batchedForms.isEndOfList;
				if (shouldProceed) {
					currentBatch = batchedForms.getNextBatch();
					algorithm();
				} else {
					// We're done.
					console.log('Completed!');
				}
			});
	};
	algorithm();
}).catch(error => {
	console.error(error);
});

// console.log(processedDoc);
// debugger;
