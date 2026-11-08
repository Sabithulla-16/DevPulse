import { describe, expect, it } from 'vitest';
import { isValidMessage } from '../src/shared/messageValidation';

describe('Message Validation', () => {
  it('validates known valid message types without payload', () => {
    expect(isValidMessage({ type: 'GET_OVERVIEW' })).toBe(true);
    expect(isValidMessage({ type: 'GET_MONITORING_STATUS' })).toBe(true);
    expect(isValidMessage({ type: 'REFRESH_METRICS' })).toBe(true);
    expect(isValidMessage({ type: 'PAUSE_MONITORING' })).toBe(true);
    expect(isValidMessage({ type: 'RESUME_MONITORING' })).toBe(true);
    expect(isValidMessage({ type: 'GET_ALERTS' })).toBe(true);
    expect(isValidMessage({ type: 'GET_SETTINGS' })).toBe(true);
    expect(isValidMessage({ type: 'RESET_DATA' })).toBe(true);
  });

  it('rejects null, non-objects, and unknown message types', () => {
    expect(isValidMessage(null)).toBe(false);
    expect(isValidMessage(undefined)).toBe(false);
    expect(isValidMessage('GET_OVERVIEW')).toBe(false);
    expect(isValidMessage(123)).toBe(false);
    expect(isValidMessage({})).toBe(false);
    expect(isValidMessage({ type: 'EXECUTE_ARBITRARY_COMMAND' })).toBe(false);
    expect(isValidMessage({ type: 'EVAL' })).toBe(false);
  });

  it('validates ACKNOWLEDGE_ALERT requires a non-empty id', () => {
    expect(isValidMessage({ type: 'ACKNOWLEDGE_ALERT', payload: { id: 'alert-123' } })).toBe(true);
    expect(isValidMessage({ type: 'ACKNOWLEDGE_ALERT' })).toBe(false);
    expect(isValidMessage({ type: 'ACKNOWLEDGE_ALERT', payload: {} })).toBe(false);
    expect(isValidMessage({ type: 'ACKNOWLEDGE_ALERT', payload: { id: '' } })).toBe(false);
    expect(isValidMessage({ type: 'ACKNOWLEDGE_ALERT', payload: { id: 456 } })).toBe(false);
  });

  it('validates UPDATE_SETTINGS with allowed setting keys and types', () => {
    expect(
      isValidMessage({
        type: 'UPDATE_SETTINGS',
        payload: {
          monitoringEnabled: true,
          sampleIntervalSeconds: 10,
          theme: 'dark'
        }
      })
    ).toBe(true);

    // Rejects invalid theme
    expect(
      isValidMessage({
        type: 'UPDATE_SETTINGS',
        payload: { theme: 'neon' }
      })
    ).toBe(false);

    // Rejects invalid interval (out of range or negative)
    expect(
      isValidMessage({
        type: 'UPDATE_SETTINGS',
        payload: { sampleIntervalSeconds: 1 }
      })
    ).toBe(false);

    // Rejects unknown setting injection
    expect(
      isValidMessage({
        type: 'UPDATE_SETTINGS',
        payload: { arbitraryKey: 'maliciousValue' }
      })
    ).toBe(false);
  });

  it('validates GET_SYSTEM_METRICS payload options', () => {
    expect(isValidMessage({ type: 'GET_SYSTEM_METRICS' })).toBe(true);
    expect(isValidMessage({ type: 'GET_SYSTEM_METRICS', payload: { limit: 50 } })).toBe(true);
    expect(isValidMessage({ type: 'GET_SYSTEM_METRICS', payload: { limit: -5 } })).toBe(false);
    expect(isValidMessage({ type: 'GET_SYSTEM_METRICS', payload: { limit: 'fifty' } })).toBe(false);
  });

  it('validates Phase 4 Coding and API messages', () => {
    expect(isValidMessage({ type: 'GET_CODING_INTELLIGENCE' })).toBe(true);
    expect(isValidMessage({ type: 'PAUSE_CODING_TRACKING' })).toBe(true);
    expect(isValidMessage({ type: 'RESUME_CODING_TRACKING' })).toBe(true);
    expect(isValidMessage({ type: 'CLEAR_CODING_DATA' })).toBe(true);
    expect(isValidMessage({ type: 'GET_API_INTELLIGENCE' })).toBe(true);
    expect(isValidMessage({ type: 'CLEAR_API_DATA' })).toBe(true);

    expect(isValidMessage({ type: 'CREATE_API_SERVICE', payload: { name: 'users-service' } })).toBe(true);
    expect(isValidMessage({ type: 'CREATE_API_SERVICE', payload: { name: '' } })).toBe(false);
    expect(isValidMessage({ type: 'CREATE_API_SERVICE' })).toBe(false);

    expect(isValidMessage({ type: 'DELETE_API_SERVICE', payload: { serviceId: 'svc_123' } })).toBe(true);
    expect(isValidMessage({ type: 'DELETE_API_SERVICE', payload: { serviceId: '' } })).toBe(false);

    expect(isValidMessage({ type: 'TOGGLE_API_SERVICE_MONITORING', payload: { serviceId: 'svc_123', enabled: true } })).toBe(true);
    expect(isValidMessage({ type: 'TOGGLE_API_SERVICE_MONITORING', payload: { serviceId: 'svc_123', enabled: 'yes' } })).toBe(false);

    expect(isValidMessage({ type: 'GET_API_ENDPOINT_DETAILS', payload: { endpointId: 'ep_123' } })).toBe(true);
    expect(isValidMessage({ type: 'GET_API_ENDPOINT_DETAILS', payload: { endpointId: '' } })).toBe(false);
  });
});

