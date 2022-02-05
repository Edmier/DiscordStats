let veryStart;
let veryEnd;

let data = {
	profile: {
		name: '',
		avatar: '',
		email: '',
		phone: '',
	},
	general: {
		messages: 0,
		counted: 0,
		deletes: 0,
		edits: 0,
		chars: 0,
		appopened: 0,
		joined: 0,
		connectedmils: 0
	}
}


let lastMessage = '';
let loading = 0;

async function scanMessages(string) {
	
	const array = CSVToArray(string);
	//Removes empty entry at end
	array.pop();
	//Reverses array so it's in chronolgical order
	array.reverse();
	//Removes file header (['ID', 'Timestamp', 'Contents', 'Attachments'])
	array.pop();

	data.general.counted += array.length;
	
	array.forEach(row => {
		const message = row[2];
		data.general.chars += message.length;
	})

	loading--;
	// console.log(array.length, array[array.length - 1]);
}

const joinleaves = new Map();

function calculateStats() {
	if (loading !== 0) {
	 	setTimeout(calculateStats, 1000);
		console.log('Not Ready');
		return;
	}
	console.log('Ready');

    const sorted = [...joinleaves.entries()].sort();

    let totalMills = 0;
    let lookingForJoin = true;
    let joinTime = 0;
    let joinChannel = '';
    for (let i = 0; i < sorted.length; i++) {
        const event = sorted[i][1];
        const timeStamp = sorted[i][0];

        if (event.type === 'join') {
            joinTime = timeStamp;
            joinChannel = event.channelId;

            lookingForJoin = false;
        } else if (!lookingForJoin && event.type === 'leave') {
            if (joinChannel !== event.channelId) continue;

            totalMills += timeStamp - joinTime;
            lookingForJoin = true;
        }
    }

	data.general.connectedmils = totalMills;
	veryEnd = Date.now();

    console.log("Total time spent in voice channels:\n" + msToTime(totalMills), totalMills);
	console.log('Total messages:', data.general.messages, data.general.counted, data.general.deletes, data.general.counted - data.general.deletes);
	console.log(`This took ${msToTime(veryEnd - veryStart)}`);

	changeValue('messages', data.general.messages);
	changeValue('calltime', msToTime(data.general.connectedmils));
	changeValue('edited', data.general.edits);
	changeValue('characters', data.general.chars);
	changeValue('opened', data.general.appopened);
	changeValue('calls', data.general.joined);
};

async function unzipFiles(zipFile) {
	resetData();
	veryStart = Date.now();
	console.log('Unzipping...');
	result.innerHTML = '';
	// result.setAttribute('hidden', 'false');

	const title = document.createElement('h4');
	title.innerHTML = zipFile.name;
	const fileContent = document.createElement('ul');
	result.appendChild(title);
	result.appendChild(fileContent);

	const progress = document.getElementById('progress');

	const dateBefore = new Date();
	const zip = await JSZip.loadAsync(zipFile);
	const dateAfter = new Date();

	const timeTaken = document.createElement('span');
	timeTaken.classList.add('small');
	timeTaken.innerHTML = ' (loaded in ' + (dateAfter - dateBefore) + 'ms)';

	title.appendChild(timeTaken);

	const files = zip.files;
	const keys = Object.keys(files);
	for (let i = 0; i < keys.length; i++) {
		const file = files[keys[i]];
		
		const item = document.createElement('li');
		item.innerHTML = file.name;
		fileContent.appendChild(item);

		if (file.dir) continue;

		if (file.name.startsWith('activity/analytics')) {
			console.log(`Unzipping analytics file...`);

			const startTime = Date.now();

			loading++;
			const blob = await zip.files[file.name].async('blob', async (metadata) => {
				progress.innerHTML = metadata.percent.toFixed(2) + '%';
			});
			await loadAnalytics(blob);

			const stopTime = Date.now();
			console.log(`Done! Took ${stopTime - startTime}ms - ${formatBytes(blob.size)}`);
		} else if (file.name.includes('messages.csv')) {
			loading++;

			zip.files[file.name].async('string').then(async (blob) => {
				scanMessages(blob);
			});
		} else if (file.name.includes('/avatar')) {
			loading++;

			await zip.files[file.name].async('base64').then(async (blob) => {
				loadAvatar(blob);
			});
		} else if (file.name.includes('user.json')) {
			loading++;

			await zip.files[file.name].async('text').then(async (blob) => {
				loadUser(blob);
			});
		}
	}
	calculateStats();
}

//Loads a file in chunks, as large files can crash the tab
async function chunkLoad(file, callback, bytes = 200000000, regex = /[\n\r]/g) {
	// const file = new File([blob], "file.txt");
	//Split file into 200MB chunks, might want to decrease this later
	const chunkCount = Math.ceil(file.size / bytes);

	//Chunk will cut a line in half, temp storage for this line for restitching
	let fragment = '';

	for (let i = 0; i < chunkCount; i++) {
		//Grab next chunk
		const chunk = (i === chunkCount - 1)
			? file.slice(i * bytes)
			: file.slice(i * bytes, (i + 1) * bytes);

		//Await chunk load
		await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.addEventListener('loadend', (e) => {
				const text = e.target.result;

				//Array of all lines in chunk
				//TODO: Change seperate for messages.csv
				const lines = text.split(regex);

				//Add fragment to start of first line to ensure complete data
				if (fragment) {
					lines[0] = fragment + lines[0];
				}
				//Reset fragment to last line
				fragment = lines[lines.length - 1];

				//If chunk isn't the last one, ignore the last line because it'll be added to the next
				for (let j = 0; j < ((i === chunkCount - 1) ? lines.length : lines.length - 1); j++) {
					//Call callback function for every line
					if (lines[j] !== '') callback(lines[j]);
				}

				resolve();
			});
			//Start file read
			reader.readAsText(chunk);
		});
	}
}

async function loadAnalytics(blob) {
	// for await (let line of makeTextFileLineIterator(blob)) {
	// 	processLine(line);
	// }
	await chunkLoad(blob, (line) => {
		processLine(line);
	});

	loading--;
}

function processLine(line) {
    if (line[line.length-1] == '\r') line=line.substr(0,line.length-1); // discard CR (0x0D)
    if (line.length <= 0) return; // ignore empty lines

    const event = JSON.parse(line);
    const type = event.event_type;

    if (type === 'join_voice_channel' || type === 'leave_voice_channel') {
        const timestamp = Date.parse(event.timestamp.replaceAll('\"', ''));
        joinleaves.set(timestamp, {
            channelId: event.channel_id,
            type: type.split('_')[0]
        });
		if (type === 'join_voice_channel') data.general.joined++;
    } else if (type === 'send_message') {
		data.general.messages++;
	} else if (type === 'message_deleted') {
		data.general.deletes++;
	} else if (type === 'message_edited') {
		data.general.edits++;
	} else if (type === 'app_opened') {
		data.general.appopened++;
	}
}

function loadAvatar(blob) {
	const img = document.getElementById('avatar');
	data.profile.avatar = 'data:image/bmp;base64,' + blob;
	img.src = data.profile.avatar;
	loading--;
}

function loadUser(string) {
	const user = JSON.parse(string);
	data.profile = {
		name: user.username + '#' + user.discriminator,
		phone: user.phone,
		email: user.email,
		avatar: data.profile.avatar
	}
	changeValue('username', user.username + '#' + user.discriminator);
	changeValue('phone', user.phone);
	changeValue('email', user.email);
	changeValue('friendcount', 'Friends: ' + user.relationships.length);
	loading--;
}

function changeValue(id, data) {
	if (typeof data === "number") {
		data = data.toLocaleString();
	}
	try {
		document.getElementById(id).innerHTML = data;
	} catch(e) { }
}

function msToTime(s) {
	let ms = s % 1000;
	s = (s - ms) / 1000;
	let secs = s % 60;
	s = (s - secs) / 60;
	let mins = s % 60;
	let hrs = (s - mins) / 60;

	return `${hrs}:${mins <= 9 ? '0' : ''}${mins}:${
		secs <= 9 ? '0' : ''
	}${secs}`;
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * CSVToArray parses any String of Data including '\r' '\n' characters,
 * and returns an array with the rows of data.
 * @param {String} CSV_string - the CSV string you need to parse
 * @param {String} delimiter - the delimeter used to separate fields of data
 * @returns {Array} rows - rows of CSV where first row are column headers
 */
 function CSVToArray (CSV_string, delimiter) {
	delimiter = (delimiter || ","); // user-supplied delimeter or default comma
 
	var pattern = new RegExp( // regular expression to parse the CSV values.
	  ( // Delimiters:
		"(\\" + delimiter + "|\\r?\\n|\\r|^)" +
		// Quoted fields.
		"(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
		// Standard fields.
		"([^\"\\" + delimiter + "\\r\\n]*))"
	  ), "gi"
	);
 
	var rows = [[]];  // array to hold our data. First row is column headers.
	// array to hold our individual pattern matching groups:
	var matches = false; // false if we don't find any matches
	// Loop until we no longer find a regular expression match
	while (matches = pattern.exec( CSV_string )) {
		var matched_delimiter = matches[1]; // Get the matched delimiter
		// Check if the delimiter has a length (and is not the start of string)
		// and if it matches field delimiter. If not, it is a row delimiter.
		if (matched_delimiter.length && matched_delimiter !== delimiter) {
		  // Since this is a new row of data, add an empty row to the array.
		  rows.push( [] );
		}
		var matched_value;
		// Once we have eliminated the delimiter, check to see
		// what kind of value was captured (quoted or unquoted):
	    if (matches[2]) { // found quoted value. unescape any double quotes.
			matched_value = matches[2].replace(
			  new RegExp( "\"\"", "g" ), "\""
			);
		} else { // found a non-quoted value
			matched_value = matches[3];
		}
		// Now that we have our value string, let's add
		// it to the data array.
		rows[rows.length - 1].push(matched_value);
	}
	return rows; // Return the parsed data Array
}

function resetData() {
	data = {
		profile: {
			name: '',
			avatar: '',
			email: '',
			phone: '',
		},
		general: {
			messages: 0,
			counted: 0,
			deletes: 0,
			edits: 0,
			chars: 0,
			appopened: 0,
			joined: 0,
			connectedmils: 0
		}
	}
}