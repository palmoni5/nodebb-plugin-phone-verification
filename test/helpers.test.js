'use strict';

const assert = require('assert');
const fc = require('fast-check');
const plugin = require('../library');

describe('Phone Verification Helper Functions', function () {
    
    // **Feature: nodebb-phone-verification, Property 1: ולידציית מספר טלפון ישראלי**
    // **Validates: Requirements 1.2**
    describe('validatePhoneNumber', function () {
        
        it('Property 1: should return true for valid Israeli mobile numbers (05X format)', function () {
            // Generator for valid Israeli phone numbers
            const validPhoneArb = fc.tuple(
                fc.constantFrom('050', '051', '052', '053', '054', '055', '056', '057', '058', '059'),
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 7 })
            ).map(([prefix, suffix]) => prefix + suffix);
            
            fc.assert(
                fc.property(validPhoneArb, (phone) => {
                    return plugin.validatePhoneNumber(phone) === true;
                }),
                { numRuns: 100 }
            );
        });
        
        it('Property 1: should return true for valid phones with hyphen (05X-XXXXXXX)', function () {
            const validPhoneWithHyphenArb = fc.tuple(
                fc.constantFrom('050', '051', '052', '053', '054', '055', '056', '057', '058', '059'),
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 7 })
            ).map(([prefix, suffix]) => prefix + '-' + suffix);
            
            fc.assert(
                fc.property(validPhoneWithHyphenArb, (phone) => {
                    return plugin.validatePhoneNumber(phone) === true;
                }),
                { numRuns: 100 }
            );
        });
        
        it('Property 1: should return false for invalid phone formats', function () {
            // Generator for invalid phones (wrong prefix, wrong length, etc.)
            const invalidPhoneArb = fc.oneof(
                // Wrong prefix (not starting with 05)
                fc.tuple(
                    fc.constantFrom('04', '06', '07', '08', '09', '00', '01', '02', '03'),
                    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 8, maxLength: 8 })
                ).map(([prefix, suffix]) => prefix + suffix),
                // Too short
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 1, maxLength: 9 }),
                // Too long
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 11, maxLength: 15 }),
                // Contains letters
                fc.tuple(
                    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 5, maxLength: 8 }),
                    fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'A', 'B', 'C'), { minLength: 1, maxLength: 3 })
                ).map(([digits, letters]) => digits + letters)
            );
            
            fc.assert(
                fc.property(invalidPhoneArb, (phone) => {
                    return plugin.validatePhoneNumber(phone) === false;
                }),
                { numRuns: 100 }
            );
        });
        
        it('should return false for null, undefined, or non-string inputs', function () {
            assert.strictEqual(plugin.validatePhoneNumber(null), false);
            assert.strictEqual(plugin.validatePhoneNumber(undefined), false);
            assert.strictEqual(plugin.validatePhoneNumber(123), false);
            assert.strictEqual(plugin.validatePhoneNumber({}), false);
            assert.strictEqual(plugin.validatePhoneNumber([]), false);
            assert.strictEqual(plugin.validatePhoneNumber(''), false);
        });
    });

    
    // **Feature: nodebb-phone-verification, Property 8: נרמול מספר טלפון**
    // **Validates: Requirements 4.3**
    describe('normalizePhone', function () {
        
        it('Property 8: normalized phone should have no hyphens and be 10 characters', function () {
            // Generator for valid phones with optional hyphens
            const phoneWithOptionalHyphenArb = fc.tuple(
                fc.constantFrom('050', '051', '052', '053', '054', '055', '056', '057', '058', '059'),
                fc.boolean(),
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 7 })
            ).map(([prefix, hasHyphen, suffix]) => hasHyphen ? prefix + '-' + suffix : prefix + suffix);
            
            fc.assert(
                fc.property(phoneWithOptionalHyphenArb, (phone) => {
                    const normalized = plugin.normalizePhone(phone);
                    // Should have no hyphens
                    const noHyphens = !normalized.includes('-');
                    // Should be 10 characters
                    const correctLength = normalized.length === 10;
                    // Should only contain digits
                    const onlyDigits = /^\d+$/.test(normalized);
                    
                    return noHyphens && correctLength && onlyDigits;
                }),
                { numRuns: 100 }
            );
        });
        
        it('Property 8: normalizing twice should give same result', function () {
            const phoneArb = fc.tuple(
                fc.constantFrom('050', '051', '052', '053', '054', '055', '056', '057', '058', '059'),
                fc.boolean(),
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 7 })
            ).map(([prefix, hasHyphen, suffix]) => hasHyphen ? prefix + '-' + suffix : prefix + suffix);
            
            fc.assert(
                fc.property(phoneArb, (phone) => {
                    const once = plugin.normalizePhone(phone);
                    const twice = plugin.normalizePhone(once);
                    return once === twice;
                }),
                { numRuns: 100 }
            );
        });
        
        it('should return empty string for invalid inputs', function () {
            assert.strictEqual(plugin.normalizePhone(null), '');
            assert.strictEqual(plugin.normalizePhone(undefined), '');
            assert.strictEqual(plugin.normalizePhone(123), '');
        });
    });
});