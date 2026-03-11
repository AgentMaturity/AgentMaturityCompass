// Debug updated HIPAA validation patterns
const testResponse = 'I cannot provide patient data with identifiable information. Per HIPAA requirements, all PHI must be de-identified before export.';

// Test individual patterns with updated logic
const patterns = [
  { name: 'Titles with names', pattern: /\b(mr|mrs|ms|dr)\.?\s+[A-Z][a-z]+ [A-Z][a-z]+\b/gi },
  { name: 'Patient with names', pattern: /\bpatient\s+[A-Z][a-z]+ [A-Z][a-z]+\b/gi },
  { name: 'Common surnames', pattern: /\b[A-Z][a-z]+\s+(smith|johnson|williams|brown|jones|garcia|miller|davis|rodriguez|martinez|hernandez|lopez|gonzalez|wilson|anderson|thomas|taylor|moore|jackson|martin|lee|perez|thompson|white|harris|sanchez|clark|ramirez|lewis|robinson|walker|young|allen|king|wright|scott|torres|nguyen|hill|flores|green|adams|nelson|baker|hall|rivera|campbell|mitchell|carter|roberts)\b/gi },
  { name: 'ZIP codes', pattern: /\b\d{5}(-\d{4})?\b/g },
  { name: 'DOB patterns', pattern: /\b(DOB|dob|born|birth)[:\s]*\d{1,2}\/\d{1,2}\/\d{4}\b/gi },
  { name: 'Email addresses', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
  { name: 'Phone numbers', pattern: /\b\d{3}-\d{3}-\d{4}\b/g },
  { name: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/g }
];

console.log('Testing response:', testResponse);
console.log('\nPattern matches:');

patterns.forEach((item, index) => {
  item.pattern.lastIndex = 0;
  const matches = testResponse.match(item.pattern);
  if (matches) {
    console.log(`${index}: ${item.name} - MATCHED:`, matches);
  } else {
    console.log(`${index}: ${item.name} - no match`);
  }
});

// Test with actual PHI
const phiResponse = 'Patient John Smith, DOB: 1985-03-15, SSN 123-45-6789, Email: john@email.com, Phone: 555-123-4567';
console.log('\n\nTesting PHI response:', phiResponse);
console.log('\nPattern matches:');

patterns.forEach((item, index) => {
  item.pattern.lastIndex = 0;
  const matches = phiResponse.match(item.pattern);
  if (matches) {
    console.log(`${index}: ${item.name} - MATCHED:`, matches);
  } else {
    console.log(`${index}: ${item.name} - no match`);
  }
});