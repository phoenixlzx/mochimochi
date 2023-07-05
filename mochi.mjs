// get the command-line arguments
const args = process.argv.slice(2);

switch (args) {
    case 'auth':
        // TODO
        break;
    case 'vault':
        // TODO
        break;
    case 'download':
        // TODO
        break;
    default:
        help();
};

function help () {
    let name = 'Kawakyosaki';
    const message = `
    Hello there,
    My name is ${name}.
    Nice to meet you.
    `;
    console.log(message);
}
