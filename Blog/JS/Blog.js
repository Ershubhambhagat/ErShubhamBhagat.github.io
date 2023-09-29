
// JavaScript code to fetch and populate all blog post data from JSON


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


            // Iterate through each blog post in the JSON data

            data.forEach((post, index) => {


                // Create a new HTML container for each blog post

                const postContainer = document.createElement('div');

                postContainer.classList.add('blog-post'); // You can add your own CSS class for styling


                // Populate HTML elements with data from the JSON

                const postTitle = document.createElement('h1');

                postTitle.textContent = post.title;

                const postDate = document.createElement('h6');

                postDate.textContent = post.date;


                const postImages = [];

                post.images.forEach((imageSrc, imageIndex) => {

                    const img = document.createElement('img');

                    img.src = imageSrc;

                    img.alt = `Image ${imageIndex + 1}`;

                    postImages.push(img);

                });


                const postDescription = document.createElement('p');

                postDescription.textContent = post.description;


                // Populate the content section with paragraphs from the JSON

                const contentContainer = document.createElement('div');

                contentContainer.classList.add('content');


                post.content.forEach(paragraph => {

                    const p = document.createElement('p');

                    p.textContent = paragraph;

                    contentContainer.appendChild(p);

                });


                // Create a "Read More" button for each post

                const readMoreButton = document.createElement('button');

                readMoreButton.textContent = 'Read More';

                readMoreButton.classList.add('collapsible'); // You can add your own CSS class for styling


                // Add event listener for toggling content visibility

                readMoreButton.addEventListener('click', function () {

                    const content = contentContainer;

                    if (content.style.display === 'block') {

                        content.style.display = 'none';

                        this.textContent = 'Read More';

                    } else {

                        content.style.display = 'block';

                        this.textContent = 'Read Less';

                    }

                });


                // Append elements to the post container

                postContainer.appendChild(postTitle);

                postContainer.appendChild(postDate);

                postImages.forEach(img => postContainer.appendChild(img));

                postContainer.appendChild(postDescription);

                postContainer.appendChild(readMoreButton);

                postContainer.appendChild(contentContainer);


                // Append the post container to your HTML document

                document.getElementById('blog-posts').appendChild(postContainer);

            });

        })


        .catch(error => {


            console.error('Error:', error);


            // You can handle the error here, such as displaying an error message to the user.


        });

});