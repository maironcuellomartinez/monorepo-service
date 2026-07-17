import { RequestType } from 'src/common/enum/request-type.enum';
import { isClosedState } from './servicenow-client.service';

describe('isClosedState()', () => {
  it('state=3 es cerrado para change_request pero NO para incident (mismo código, distinta tabla)', () => {
    expect(isClosedState(RequestType.CHANGE_REQUEST, '3')).toBe(true);
    expect(isClosedState(RequestType.INCIDENT, '3')).toBe(false);
  });

  it('reconoce los códigos cerrados de incident (6=Resolved, 7=Closed)', () => {
    expect(isClosedState(RequestType.INCIDENT, '6')).toBe(true);
    expect(isClosedState(RequestType.INCIDENT, '7')).toBe(true);
    expect(isClosedState(RequestType.INCIDENT, '1')).toBe(false);
  });

  it('reconoce los códigos cerrados de change_request (0=Review/Resolved, 3=Closed)', () => {
    expect(isClosedState(RequestType.CHANGE_REQUEST, '0')).toBe(true);
    expect(isClosedState(RequestType.CHANGE_REQUEST, '3')).toBe(true);
  });

  it('reconoce los códigos cerrados de sc_req_item (3, 4)', () => {
    expect(isClosedState(RequestType.SERVICE_CATALOG, '3')).toBe(true);
    expect(isClosedState(RequestType.SERVICE_CATALOG, '4')).toBe(true);
  });

  it('reconoce el código cerrado de problem (4)', () => {
    expect(isClosedState(RequestType.PROBLEM, '4')).toBe(true);
    expect(isClosedState(RequestType.PROBLEM, '3')).toBe(false);
  });

  it('los strings semánticos aplican a cualquier tipo, sin importar mayúsculas', () => {
    expect(isClosedState(RequestType.KNOWLEDGE_ARTICLE, 'resolved')).toBe(true);
    expect(isClosedState(RequestType.RELEASE_TASK, 'CLOSED')).toBe(true);
    expect(isClosedState(RequestType.CONFIGURATION_ITEM, 'Resolved')).toBe(
      true,
    );
  });

  it('tipos sin mapeo de códigos numéricos solo reconocen los strings semánticos', () => {
    expect(isClosedState(RequestType.KNOWLEDGE_ARTICLE, '4')).toBe(false);
    expect(isClosedState(RequestType.RELEASE_TASK, '6')).toBe(false);
  });
});
