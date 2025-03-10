const colors = [
    '\x1b[43m\x1b[34m', // Yellow background, Blue text
    '\x1b[42m\x1b[30m', // Green background, Black text
    '\x1b[41m\x1b[37m', // Red background, White text
    '\x1b[44m\x1b[33m', // Blue background, Yellow text
    '\x1b[45m\x1b[30m', // Magenta background, Black text
    '\x1b[46m\x1b[35m', // Cyan background, Magenta text
    '\x1b[47m\x1b[31m', // White background, Red text
    '\x1b[40m\x1b[36m', // Black background, Cyan text
    '\x1b[41m\x1b[33m', // Red background, Yellow text
    '\x1b[42m\x1b[37m', // Green background, White text
    '\x1b[44m\x1b[35m', // Blue background, Magenta text
    '\x1b[45m\x1b[37m', // Magenta background, White text
    '\x1b[46m\x1b[30m', // Cyan background, Black text
    '\x1b[47m\x1b[34m', // White background, Blue text
    '\x1b[40m\x1b[33m', // Black background, Yellow text
    '\x1b[41m\x1b[32m', // Red background, Green text
    '\x1b[42m\x1b[31m', // Green background, Red text
    '\x1b[43m\x1b[35m', // Yellow background, Magenta text
    '\x1b[44m\x1b[30m', // Blue background, Black text
    '\x1b[45m\x1b[36m', // Magenta background, Cyan text
    '\x1b[46m\x1b[33m', // Cyan background, Yellow text
    '\x1b[47m\x1b[32m', // White background, Green text
];

export function logWithColor(message) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    console.log(`${color}${message}\x1b[0m`);
}
