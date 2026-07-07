const { calculateSaju } = require('ssaju');
const r = calculateSaju({ year: 1990, month: 1, day: 1, hour: 23, minute: 45, gender: '남' });
console.log(JSON.stringify(r, null, 2));
