
export function parseConstraint(constraintStr: string) {
  try {
    const cleaned = constraintStr.trim().replace(/\s+/g, ' ');
    
    let operator = null;
    let parts = null;
    
    if (cleaned.includes('<=')) {
      operator = '<=';
      parts = cleaned.split('<=');
    } else if (cleaned.includes('≥')) {
      operator = '>=';
      parts = cleaned.split('≥');
    } else if (cleaned.includes('>=')) {
      operator = '>=';
      parts = cleaned.split('>=');
    } else if (cleaned.includes('≤')) {
      operator = '<=';
      parts = cleaned.split('≤');
    } else if (cleaned.includes('=') && !cleaned.includes('<=') && !cleaned.includes('>=') && !cleaned.includes('≤') && !cleaned.includes('≥')) {
      operator = '=';
      parts = cleaned.split('=');
    } else {
      return { success: false, error: "No valid operator found (<=, >=, =, ≤, ≥)" };
    }
    
    if (parts.length !== 2) {
      return { success: false, error: "Invalid constraint format" };
    }
    
    const leftSide = parts[0].trim();
    const rightSide = parts[1].trim();
    
    const { success: leftSuccess, x: A, y: B, error: leftError } = parseLinearExpression(leftSide);
    if (!leftSuccess) {
      return { success: false, error: leftError };
    }
    
    const C = parseFloat(rightSide);
    if (isNaN(C)) {
      return { success: false, error: "Right side must be a number" };
    }
    
    let finalA = A, finalB = B, finalC = C;
    if (operator === '>=') {
      finalA = -(A ?? 0);
      finalB = -(B ?? 0);
      finalC = -(C ?? 0);
    }
    return { success: true, constraint: [finalA, finalB, finalC] };
    
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

function parseLinearExpression(expr: string) {
  try {
    let x_coeff = 0;
    let y_coeff = 0;
    
    let cleaned = expr.replace(/\s+/g, '');
    
    if (cleaned[0] !== '+' && cleaned[0] !== '-') {
      cleaned = '+' + cleaned;
    }
    
    const terms = cleaned.match(/[+-][^+-]+/g) || [];
    
    for (const term of terms) {
      const trimmed = term.trim();
      
      if (trimmed.includes('x')) {
        let coeff_str = trimmed.replace('x', '');
        if (coeff_str === '+' || coeff_str === '') {
          x_coeff = 1;
        } else if (coeff_str === '-') {
          x_coeff = -1;
        } else {
          x_coeff = parseFloat(coeff_str);
          if (isNaN(x_coeff)) {
            return { success: false, error: `Invalid x coefficient: ${coeff_str}` };
          }
        }
      } else if (trimmed.includes('y')) {
        let coeff_str = trimmed.replace('y', '');
        if (coeff_str === '+' || coeff_str === '') {
          y_coeff = 1;
        } else if (coeff_str === '-') {
          y_coeff = -1;
        } else {
          y_coeff = parseFloat(coeff_str);
          if (isNaN(y_coeff)) {
            return { success: false, error: `Invalid y coefficient: ${coeff_str}` };
          }
        }
      } else {
        const const_val = parseFloat(trimmed);
        if (!isNaN(const_val) && const_val !== 0) {
          return { success: false, error: "Constant terms should be on the right side" };
        }
      }
    }
    
    return { success: true, x: x_coeff, y: y_coeff };
    
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export function parseObjective(objectiveStr: string) {
  try {
    const cleaned = objectiveStr.trim().toLowerCase();
    
    let direction = null;
    let expression = null;
    
    if (cleaned.startsWith('max')) {
      direction = 'max';
      expression = cleaned.substring(3).trim();
    } else if (cleaned.startsWith('min')) {
      direction = 'min';
      expression = cleaned.substring(3).trim();
    } else {
      direction = 'max';
      expression = cleaned;
    }
    
    const { success, x, y, error } = parseLinearExpression(expression);
    if (!success) {
      return { success: false, error };
    }
    
    return { success: true, direction, x, y };
    
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export function parseConstraints(constraintStrings: string[]) {
  const constraints = [];
  const errors = [];
  
  for (let i = 0; i < constraintStrings.length; i++) {
    const str = constraintStrings[i].trim();
    if (str === '') continue;
    
    const result = parseConstraint(str);
    if (result.success) {
      constraints.push(result.constraint);
    } else {
      errors.push(`Line ${i + 1}: ${result.error}`);
    }
  }
  
  return {
    success: errors.length === 0,
    constraints,
    errors
  };
} 