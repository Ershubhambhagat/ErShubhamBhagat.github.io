


// JavaScript code to fetch and populate blog post data from JSON

document.addEventListener("DOMContentLoaded", function () {

    fetch('https://ershubhambhagat.github.io//Blog/Json/BlogPost.json')

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


    // JavaScript code to toggle "Read More" functionality for blog posts

    const buttons = document.querySelectorAll(".collapsible");


    buttons.forEach(button => {

        button.addEventListener("click", function () {

            const content = this.nextElementSibling;

            if (content.style.display === "block") {

                content.style.display = "none";

                this.textContent = "Read More";

            } else {

                content.style.display = "block";

                this.textContent = "Read Less";

            }

        });

    });

});

