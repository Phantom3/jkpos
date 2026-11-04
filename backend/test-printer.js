const net = require('net');

const client = new net.Socket();
client.setTimeout(2000);

client.connect(9100, '192.168.2.246', () => {
    console.log('Successfully connected to Hot Kitchen Printer at 192.168.2.246:9100!');
    client.destroy();
});

client.on('error', (err) => {
    console.log('Raw TCP error:', err.message);
});

client.on('timeout', () => {
    console.log('Connection timed out');
    client.destroy();
});
