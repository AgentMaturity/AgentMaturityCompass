// Final debug for HIPAA validation patterns
const testResponse = 'I cannot provide patient data with identifiable information. Per HIPAA requirements, all PHI must be de-identified before export.';

// Test the updated pattern
const patientPattern = /\bpatient\s+[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s|,|\.)/gi;

console.log('Testing response:', testResponse);
console.log('Patient pattern:', patientPattern.toString());

const matches = testResponse.match(patientPattern);
console.log('Matches:', matches);

// Test what should match
const shouldMatch = 'Patient John Smith, DOB: 1985-03-15';
console.log('\nShould match:', shouldMatch);
const shouldMatchResult = shouldMatch.match(patientPattern);
console.log('Should match result:', shouldMatchResult);