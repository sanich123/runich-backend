import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { isValidIanaTimeZone } from 'src/common/utils/time-zone';

@ValidatorConstraint({ name: 'isIanaTimeZone', async: false })
export class IsIanaTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return isValidIanaTimeZone(value);
  }

  defaultMessage() {
    return 'timeZone must be a valid IANA time zone';
  }
}
