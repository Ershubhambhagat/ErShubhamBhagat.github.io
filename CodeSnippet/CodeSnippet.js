document.addEventListener("DOMContentLoaded", displayCodeSnippets);
function displayCodeSnippets() {
   const codeContainer = document.getElementById("codeContainer");
   const codeData = [
    {
        title: 'Get AppSetting Connection String',

        code:`
        private readonly AppSettings appSettings;
        private readonly string oracleConnection;`+`
        public OracleTest(IOptions<AppSettings> appSettings)
        {
            this.appSettings = appSettings?.Value ?? throw new ArgumentNullException(nameof(appSettings));
            oracleConnection = this.appSettings.OracleConnection;
        }`
        ,

        description: 'This code is for getting connection string from Appsetting ',
        tags: ['C#', '.net ']
    },


       {
           title: 'Remove WhiteSpace in VS Code  ',
           code: `^\\s*$\\n`,
           description: `'How do I remove line spacing in VS Code?\n
           To remove empty lines in Visual Studio Code, you can use the built-in “Find and Replace” feature with a regular expression:\n
           Open the file you want to remove empty lines from in Visual Studio Code.\n
           Press Ctrl + H (Windows/Linux) or Command + H (Mac) to open the "Find and Replace" panel.\n
           In the “Find” field, type: ^\s*$\n.',`,
           tags: ['VS Code  ', 'Trick']
       },

    {
        title: 'Git Problem',
        code: `

        >Installed the [YourCompany] CA5 certificates\n
        >Run the commands in Git CMD\n
        git config --global http.sslVerify false\n
        git config --global http.sslBackend schannel',`,

        description: ` If you are facing Git Problem 'Git failed with a fatal error. Git failed with a fatal error. unable to access'
        'https://github.com/{YourRepo} OpenSSL/3.1.4: error:0A000152:SSL routines::unsafe legacy renegotiation disabled
        `,
        tags: ['Git' ]
    },
    {
        title: 'Demo Title',
        code: 'Demo Code',

        description: 'Demo description',
        tags: ['Demo Tag' ]
    },
    {
        title: 'Demo Title',
        code: 'Demo Code',

        description: 'Demo description',
        tags: ['Demo Tag' ]
    },



       // Add more code snippets as needed
   ];
   codeData.forEach((snippet, index) => {
       const snippetDiv = document.createElement("div");
       snippetDiv.classList.add("codeSnippet");
       const countTitleContainer = document.createElement("div");
       countTitleContainer.classList.add("codeCountTitleContainer");
       const countElement = document.createElement("p");
       countElement.classList.add("codeCount");
       countElement.textContent = index + 1;
       countTitleContainer.appendChild(countElement);
       const titleElement = document.createElement("p");
       titleElement.classList.add("codeTitle");
       titleElement.textContent = snippet.title;
       countTitleContainer.appendChild(titleElement);
       snippetDiv.appendChild(countTitleContainer);
       const codeElement = document.createElement("code");
       codeElement.textContent = snippet.code;
       snippetDiv.appendChild(codeElement);
       const readMoreContainer = document.createElement("div");
       readMoreContainer.classList.add("readMoreContainer");
       const descriptionElement = document.createElement("p");
       descriptionElement.classList.add("codeDescription");
       descriptionElement.textContent = snippet.description;
       readMoreContainer.appendChild(descriptionElement);
       const readMoreButton = document.createElement("button");
       readMoreButton.classList.add("readMoreButton");
       readMoreButton.textContent = "Read More";
       readMoreButton.addEventListener("click", () => toggleDescription(readMoreContainer));
       snippetDiv.appendChild(readMoreButton);
       snippetDiv.appendChild(readMoreContainer);
       const tagsElement = document.createElement("p");
       tagsElement.classList.add("codeTags");
       tagsElement.textContent = `Tags: ${snippet.tags.join(', ')}`;
       snippetDiv.appendChild(tagsElement);
       const copyButton = document.createElement("button");
       copyButton.classList.add("copyButton");
       copyButton.textContent = "Copy Code";
       copyButton.addEventListener("click", () => copyCodeToClipboard(snippet.code));
       snippetDiv.appendChild(copyButton);
       codeContainer.appendChild(snippetDiv);
   });
   // You can add this line if you want to initially set dark mode based on user preference or other factors.
   // document.body.classList.toggle("dark-mode", isDarkModeEnabled());
}
function toggleDarkMode() {
   document.body.classList.toggle("dark-mode");
}
function copyCodeToClipboard(code) {
   navigator.clipboard.writeText(code)
       .then(() => alert("Code copied to clipboard!"))
       .catch(err => console.error("Error copying code:", err));
}
function toggleDescription(readMoreContainer) {
   readMoreContainer.classList.toggle("expanded");
}
