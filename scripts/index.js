const inputElement = document.getElementById('data-input');
inputElement.addEventListener('change', handleFiles, false);
const result = document.querySelector('#result');

function handleFiles() {
	const fileList = this.files;
	const file = fileList[0];
	console.log('... file[' + 0 + '].name = ' + file.name);

	unzipFiles(file);
}

/* Other method of reading text files, ~20% slower

for await (let line of makeTextFileLineIterator(blob)) {
	totalMessages++;
}
*/
async function* makeTextFileLineIterator(blob) {
	const utf8Decoder = new TextDecoder("utf-8");
	const reader = blob.stream().getReader();

	let { value: chunk, done: readerDone } = await reader.read();
	chunk = chunk ? utf8Decoder.decode(chunk, {stream: true}) : "";
  
	const re = /\r\n|\n|\r/gm;
	let startIndex = 0;
  
	for (;;) {
	  const result = re.exec(chunk);
	  if (!result) {
		if (readerDone) {
		  break;
		}
		const remainder = chunk.substr(startIndex);
		({value: chunk, done: readerDone} = await reader.read());
		chunk = remainder + (chunk ? utf8Decoder.decode(chunk, {stream: true}) : "");
		startIndex = re.lastIndex = 0;
		continue;
	  }
	  yield chunk.substring(startIndex, result.index);
	  startIndex = re.lastIndex;
	}
	if (startIndex < chunk.length) {
	  // last line didn't end in a newline char
	  yield chunk.substr(startIndex);
	}
}
//*/

function dropHandler(ev) {
	console.log('File(s) dropped');

	// Prevent default behavior (Prevent file from being opened)
	ev.preventDefault();

	if (ev.dataTransfer.items) {
		// Use DataTransferItemList interface to access the file(s)
		for (let i = 0; i < ev.dataTransfer.items.length; i++) {
			// If dropped items aren't files, reject them
			if (ev.dataTransfer.items[0].kind === 'file') {
				const file = ev.dataTransfer.items[0].getAsFile();
				console.log('... file[' + 0 + '].name = ' + file.name);
				unzipFiles(file);
			}
		}
	} else {
		// Use DataTransfer interface to access the file(s)
		for (let i = 0; i < ev.dataTransfer.files.length; i++) {
			console.log(
				'... file[' + i + '].name = ' + ev.dataTransfer.files[i].name
			);
			const file = ev.dataTransfer.files[i];
			unzipFiles(file);
		}
	}
}

function isValidJSON(jsonString){
    try {
        var o = JSON.parse(jsonString);

        // Handle non-exception-throwing cases:
        // Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
        // but... JSON.parse(null) returns null, and typeof null === "object", 
        // so we must check for that, too. Thankfully, null is falsey, so this suffices:
        if (o && typeof o === "object") {
            return o;
        }
    }
    catch (e) { }

    return false;
};
