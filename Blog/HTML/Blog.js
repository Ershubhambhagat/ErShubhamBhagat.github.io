
// Function to fetch and populate the blog post content

function fetchAndPopulateBlogPost() {

    fetch('BlogPost.json') // Adjust the path to your JSON file

        .then(response => {

            if (!response.ok) {

                throw new Error('Network response was not ok');

            }

            return response.json();

        })

        .then(data => {

            if (data.length === 0) {

                throw new Error('JSON data is empty');

            }

            const post = data[0]; // Assuming you want to display the first blog post


            // Populate HTML elements with data from the JSON

            document.getElementById('post-title').textContent = post.title;

            document.getElementById('post-date').textContent = post.date;

            document.getElementById('post-image-1').src = post.images[0];

            document.getElementById('post-image-2').src = post.images[1];

            document.getElementById('post-description').textContent = post.description;


            // Populate the content section with paragraphs from the JSON

            const contentContainer = document.getElementById('post-content');

            post.content.forEach(paragraph => {

                const p = document.createElement('p');

                p.textContent = paragraph;

                contentContainer.appendChild(p);

            });

        })

        .catch(error => {

            console.error('Error:', error);

            // You can handle the error here, such as displaying an error message to the user.

        });

}


// Call the function when the page loads

window.addEventListener('load', fetchAndPopulateBlogPost);