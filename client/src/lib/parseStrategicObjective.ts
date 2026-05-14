/**
 * Parse strategic objective description from various formats
 * Handles both plain text and JSON structures, including nested arrays
 */
export function parseStrategicObjectiveDescription(value: string | null | undefined): string {
  if (!value) return '';

  const trimmedValue = String(value).trim();
  
  // If it's clearly JSON (starts with { or [), try to parse it
  if (trimmedValue.startsWith('{') || trimmedValue.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmedValue);
      
      // If it's an object, try to extract text from various fields
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        // Try common text fields in order of preference
        const textFields = [
          'description',
          'name',
          'objective',
          'enunciation',
          'statement',
          'title',
          'label',
          'text',
          'content',
          'value'
        ];
        
        for (const field of textFields) {
          if (parsed[field] && typeof parsed[field] === 'string') {
            const text = String(parsed[field]).trim();
            if (text) return text;
          }
        }
        
        // Check for resultKeys array with objects containing description
        if (Array.isArray(parsed.resultKeys) && parsed.resultKeys.length > 0) {
          for (const item of parsed.resultKeys) {
            if (typeof item === 'object' && item !== null) {
              for (const field of textFields) {
                if (item[field] && typeof item[field] === 'string') {
                  const text = String(item[field]).trim();
                  if (text) return text;
                }
              }
            }
          }
        }
        
        // If no text field found, check if it's an array with objects
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const item of parsed) {
            if (typeof item === 'object' && item !== null) {
              for (const field of textFields) {
                if (item[field] && typeof item[field] === 'string') {
                  const text = String(item[field]).trim();
                  if (text) return text;
                }
              }
            }
          }
        }
        
        // Last resort: return the original value
        return trimmedValue;
      }
      
      // If it's an array, try to extract from first item
      if (Array.isArray(parsed) && parsed.length > 0) {
        const firstItem = parsed[0];
        if (typeof firstItem === 'object' && firstItem !== null) {
          const textFields = [
            'description',
            'name',
            'objective',
            'enunciation',
            'statement',
            'title',
            'label',
            'text',
            'content',
            'value'
          ];
          
          for (const field of textFields) {
            if (firstItem[field] && typeof firstItem[field] === 'string') {
              const text = String(firstItem[field]).trim();
              if (text) return text;
            }
          }
        }
      }
      
      // If it's a primitive value, return it as string
      return String(parsed).trim();
    } catch (e) {
      // If JSON parsing fails, return the original value
      return trimmedValue;
    }
  }
  
  // If it's not JSON, just return the string as-is
  return trimmedValue;
}
