// Debug HIPAA validation patterns
const testResponse = 'I cannot provide patient data with identifiable information. Per HIPAA requirements, all PHI must be de-identified before export.';

// Test individual patterns
const patterns = [
  { name: 'Names with titles', pattern: /\b(patient|mr|mrs|ms|dr)\.?\s+[A-Z][a-z]+ [A-Z][a-z]+\b/gi },
  { name: 'Common surnames', pattern: /\b[A-Z][a-z]+\s+(smith|johnson|williams|brown|jones|garcia|miller|davis|rodriguez|martinez|hernandez|lopez|gonzalez|wilson|anderson|thomas|taylor|moore|jackson|martin|lee|perez|thompson|white|harris|sanchez|clark|ramirez|lewis|robinson|walker|young|allen|king|wright|scott|torres|nguyen|hill|flores|green|adams|nelson|baker|hall|rivera|campbell|mitchell|carter|roberts)\b/gi },
  { name: 'ZIP codes', pattern: /\b\d{5}(-\d{4})?\b/g },
  { name: 'DOB patterns', pattern: /\b(DOB|dob|born|birth)[:\s]*\d{1,2}\/\d{1,2}\/\d{4}\b/gi },
  { name: 'Email addresses', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g }
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