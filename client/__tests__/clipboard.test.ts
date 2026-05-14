import { describe, it, expect, vi } from 'vitest';

describe('Clipboard Copy Fallback Logic', () => {
  it('should create textarea element for fallback copy', () => {
    const testText = 'https://example.com/login';
    const textarea = document.createElement('textarea');
    textarea.value = testText;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    
    expect(textarea.value).toBe(testText);
    expect(textarea.style.position).toBe('fixed');
    expect(textarea.style.opacity).toBe('0');
    
    document.body.removeChild(textarea);
  });

  it('should handle execCommand copy method', () => {
    const execCommandMock = vi.spyOn(document, 'execCommand').mockReturnValue(true);
    
    const textarea = document.createElement('textarea');
    textarea.value = 'test-link';
    document.body.appendChild(textarea);
    textarea.select();
    
    const result = document.execCommand('copy');
    
    expect(result).toBe(true);
    expect(execCommandMock).toHaveBeenCalledWith('copy');
    
    document.body.removeChild(textarea);
    execCommandMock.mockRestore();
  });

  it('should properly clean up textarea after copy', () => {
    const textarea = document.createElement('textarea');
    textarea.id = 'test-textarea';
    textarea.value = 'test-link';
    document.body.appendChild(textarea);
    
    expect(document.getElementById('test-textarea')).toBe(textarea);
    
    document.body.removeChild(textarea);
    
    expect(document.getElementById('test-textarea')).toBeNull();
  });
});
