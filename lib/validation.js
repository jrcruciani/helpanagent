const VALID_CATEGORIES = ['social', 'ethical', 'emotional', 'cultural'];

export function validatePulseInput(body) {
  const errors = [];

  if (!body.question || typeof body.question !== 'string' || body.question.trim().length < 10) {
    errors.push('question must be a string of at least 10 characters');
  }
  if (body.question && body.question.length > 2000) {
    errors.push('question must not exceed 2000 characters');
  }
  if (body.context !== undefined && typeof body.context !== 'string') {
    errors.push('context must be a string');
  }
  if (body.context && body.context.length > 5000) {
    errors.push('context must not exceed 5000 characters');
  }
  if (body.payload !== undefined && typeof body.payload !== 'string') {
    errors.push('payload must be a string');
  }
  if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
    errors.push(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }
  if (body.min_responses !== undefined) {
    if (!Number.isInteger(body.min_responses) || body.min_responses < 3 || body.min_responses > 7) {
      errors.push('min_responses must be an integer between 3 and 7');
    }
  }

  return errors;
}

export function validateResponseInput(body) {
  const errors = [];

  if (!body.direction || !['yes', 'no', 'depends'].includes(body.direction)) {
    errors.push('direction must be one of: yes, no, depends');
  }
  if (body.certainty === undefined || !Number.isInteger(body.certainty) || body.certainty < 1 || body.certainty > 5) {
    errors.push('certainty must be an integer between 1 and 5');
  }

  return errors;
}
