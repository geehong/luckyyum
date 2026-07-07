const { calculateFourPillars } = require('manseryeok');
const { calculateSaju } = require('ssaju');

const year = 1990, month = 1, day = 1, hour = 23, minute = 45;

console.log('\n[2] ssaju');
const r2 = calculateSaju({ year, month, day, hour, minute, gender: '남' });
console.log(r2.toCompact());
