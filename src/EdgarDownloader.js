const _ = require('lodash');
const rp = require('request-promise');

class EdgarDownloader {
	_getCikUrl(cik) {
		return `https://www.sec.gov/Archives/edgar/data/${cik}/index.json`;
	}

	_getAccessionUrl(cik, accessionNumber) {
		const filename = this._getFileName(accessionNumber);
		return `https://www.sec.gov/Archives/edgar/data/${cik}/${filename}`;
	}

	_getFullIndex() {
		return 'https://www.sec.gov/Archives/edgar/full-index/index.json';
	}

	_getYearIndex(year) {
		return `https://www.sec.gov/Archives/edgar/full-index/${year}/index.json`;
	}

	_getCrawlerFile(year, quarter) {
		return `https://www.sec.gov/Archives/edgar/full-index/${year}/${quarter}/crawler.idx`;
	}

	_getIdentifier(url) {
		return url.replace('https://www.sec.gov/Archives/', '');
	}

	_getFileName(accessionNumber) {
		return `${accessionNumber}.txt`;
	}

	_sendRequest(uri, isJSON = true) {
		const options = {
			uri,
			json: isJSON,
		};
		return rp(uri);
	}

	_extractString(text, start, end) {
		return text.substring(start, end).trim();
	}

	filterDirectoriesFromList(list) {
		const items = _.get(list, 'directory.item', {});
		return _.filter(items, item => item.type === 'dir');
	}

	downloadCikList(cik) {
		const uri = this._getCikUrl(cik);
		return this._sendRequest(uri);
	}

	downloadAccessionNumber(cik, accessionNumber) {
		const uri = this._getAccessionUrl(cik, accessionNumber);
		return this._sendRequest(uri);
	}

	downloadFullIndexDirList() {
		const uri = this._getFullIndex();
		return this._sendRequest(uri).then(response => {
			return this.filterDirectoriesFromList(response);
		}).catch(error => {
			return { error };
		});
	}

	downloadDirListForYear(year) {
		const uri = this._getYearIndex(year);
		return this._sendRequest(uri).then(response => {
			return this.filterDirectoriesFromList(response);
		}).catch(error => {
			return { error };
		});
	}

	downloadIndexForYearAndQuarter(year, quarter) {
		const uri = this._getCrawlerFile(year, quarter);
		return this._sendRequest(uri, false);
	}

	getParsedIndexForYearAndQuarter(year, quarter) {
		return this.downloadIndexForYearAndQuarter(year, quarter).then(rawIndex => {
			// Remove the first 9 and last line
			const lines = rawIndex.split('\n').slice(9);
			lines.splice(-1);

			const result = [];
			lines.forEach(line => {
				const extractString = (start, end) => this._extractString(line, start, end);
				result.push({
					companyName: extractString(0, 62),
					formType: extractString(62, 74),
					cik: extractString(74, 86),
					date: new Date(extractString(86, 98)),
					url: extractString(98, line.length - 1),
				});
			});
			return result;
		}).catch(error => {
			return { error };
		});
	}

	getFormsDownloaderForYearAndQuarter(year, quarter) {
		return this.getParsedIndexForYearAndQuarter(year, quarter).then(entries => {
			return entries.map(entry => {
				if (!entry.url) {
					return;
				}
				const fileName = _.last(entry.url.split('/'));
				const match = fileName.match(/^(.*)-index.*$/);
				if (_.isNil(match)) {
					return;
				}
				const accessionNumber = match[1];
				let url = this._getAccessionUrl(entry.cik, accessionNumber);
				const downloader = () => {
					return this.downloadAccessionNumber(entry.cik, accessionNumber);
				};
				return {
					...entry,
					url,
					identifier: this._getIdentifier(url),
					fileName: this._getFileName(accessionNumber),
					downloadForm: downloader,
				};
			});
		}).catch(error => {
			debugger;
			return error;
		});
	}

	batch(fullList, batchSize) {
		let index = 0;
		let prevIndex = index;
		let currentBatch = [];
		let isEndOfList = false;
		const listSize = fullList.length;
		const next = () => {
			if (index >= listSize) {
				isEndOfList = true;
				return;
			}
			const batchStart = index;
			let batchEnd = index + batchSize;
			if (batchEnd > listSize) {
				batchEnd = listSize;
			}
			currentBatch = _.slice(fullList, batchStart, batchEnd);
			prevIndex = index;
			index = batchEnd;
			return currentBatch;
		};
		next();
		return {
			getCurrentBatch: () => currentBatch,
			getNextBatch: next,
			getCurrentIndex: () => prevIndex,
			getNextIndex: () => index,
			isEndOfList,
		};
	}
}

exports.EdgarDownloader = EdgarDownloader;
