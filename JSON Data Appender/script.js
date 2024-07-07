document.getElementById('addContent').addEventListener('click', function() {
    let contentDiv = document.createElement('div');
    contentDiv.classList.add('content-section');
    contentDiv.innerHTML = `
        <label for="heading">Heading:</label>
        <input type="text" class="heading" required>

        <label for="paragraphs">Paragraphs (comma separated):</label>
        <textarea class="paragraphs" required></textarea>
    `;
    document.getElementById('content').appendChild(contentDiv);
});

document.getElementById('fileInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const fileName = file.name.toLowerCase();
            if (fileName.endsWith('.txt')) {
                handleTxtFile(e.target.result);
            } else if (fileName.endsWith('.json')) {
                handleJsonFile(e.target.result);
            } else {
                console.error('Unsupported file type.');
            }
        };
        reader.readAsText(file);
    }
});

let fileData = null;

function handleTxtFile(fileContent) {
    // Handle text file content if needed
    console.log('Text File Content:', fileContent);
}

function handleJsonFile(fileContent) {
    try {
        fileData = JSON.parse(fileContent);
        localStorage.setItem('jsonData', JSON.stringify(fileData));
        alert('JSON File loaded successfully!');
    } catch (error) {
        console.error('Error parsing JSON file:', error);
    }
}

document.getElementById('dataForm').addEventListener('submit', function(event) {
    event.preventDefault();

    let currentNumber = localStorage.getItem('articleNumber');
    currentNumber = currentNumber ? parseInt(currentNumber) : 1;

    let formData = {
        number: currentNumber,
        title: currentNumber + ' - ' + document.getElementById('title').value,
        date: document.getElementById('date').value,
        images: [],
        description: document.getElementById('description').value,
        content: []
    };

    // Handle image URLs
    let imageUrls = document.getElementById('imageUrls').value.split(',').map(item => item.trim());
    formData.images.push(...imageUrls);

    // Handle image uploads
    let imageUpload = document.getElementById('imageUpload').files;
    let directoryPath = document.getElementById('directoryPath').value.trim();
    for (let i = 0; i < imageUpload.length; i++) {
        let filePath = directoryPath ? directoryPath + '\\' + imageUpload[i].name : imageUpload[i].name;
        formData.images.push(filePath);
    }

    document.querySelectorAll('.content-section').forEach(section => {
        let heading = section.querySelector('.heading').value;
        let paragraphs = section.querySelector('.paragraphs').value.split(',').map(item => item.trim());
        formData.content.push({ heading, paragraphs });
    });

    let existingData = localStorage.getItem('jsonData');
    existingData = existingData ? JSON.parse(existingData) : [];

    existingData.push(formData);

    localStorage.setItem('jsonData', JSON.stringify(existingData));
    localStorage.setItem('articleNumber', currentNumber + 1);

    alert('Data appended successfully!');
    document.getElementById('dataForm').reset();
});

document.getElementById('downloadData').addEventListener('click', function() {
    let existingData = localStorage.getItem('jsonData');
    existingData = existingData ? JSON.parse(existingData) : [];

    let blob = new Blob([JSON.stringify(existingData, null, 2)], { type: "application/json" });
    saveAs(blob, "data.json");
});
