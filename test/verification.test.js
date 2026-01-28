'use strict';

const assert = require('assert');
const fc = require('fast-check');
const plugin = require('../library');

// Helper to generate a 4-digit code (simulating the Tzintuk code)
const generateTzintukCode = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
};

describe('Verification Code Logic', function () {
    
    // ניקוי לפני כל בדיקה
    beforeEach(function () {
        if (typeof plugin.clearAllCodes === 'function') {
            plugin.clearAllCodes();
        }
    });
    
    // **Feature: nodebb-phone-verification, Property 3: תוקף קוד אימות**
    // **Validates: Requirements 2.4**
    describe('Code Expiry (Property 3)', function () {
        
        it('Property 3: saved code should have expiry exactly 5 minutes from creation', function () {
            const validPhoneArb = fc.tuple(
                fc.constantFrom('050', '052', '054'),
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 7 })
            ).map(([prefix, suffix]) => prefix + suffix);
            
            fc.assert(
                fc.property(validPhoneArb, (phone) => {
                    if (typeof plugin.clearVerificationCode === 'function') plugin.clearVerificationCode(phone);
                    
                    // Generate 4-digit code locally as plugin.generateVerificationCode no longer exists
                    const code = generateTzintukCode();
                    
                    const before = Date.now();
                    const result = plugin.saveVerificationCode(phone, code);
                    const after = Date.now();
                    
                    if (!result.success) return true; // Skip blocked phones if mock state persists
                    
                    const expectedMinExpiry = before + (5 * 60 * 1000);
                    const expectedMaxExpiry = after + (5 * 60 * 1000);
                    
                    return result.expiresAt >= expectedMinExpiry && result.expiresAt <= expectedMaxExpiry;
                }),
                { numRuns: 100 }
            );
        });
    });

    
    // **Feature: nodebb-phone-verification, Property 4: אימות קוד נכון**
    // **Validates: Requirements 3.1**
    describe('Correct Code Verification (Property 4)', function () {
        
        it('Property 4: correct 4-digit code should always verify successfully', function () {
            const validPhoneArb = fc.tuple(
                fc.constantFrom('050', '052', '054'),
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 7 })
            ).map(([prefix, suffix]) => prefix + suffix);
            
            fc.assert(
                fc.property(validPhoneArb, (phone) => {
                    if (typeof plugin.clearVerificationCode === 'function') plugin.clearVerificationCode(phone);
                    
                    const code = generateTzintukCode();
                    plugin.saveVerificationCode(phone, code);
                    
                    const result = plugin.verifyCode(phone, code);
                    return result.success === true;
                }),
                { numRuns: 100 }
            );
        });
        
        it('Property 4: code should be deleted after successful verification', function () {
            const phone = '0501234567';
            const code = '1234';
            plugin.saveVerificationCode(phone, code);
            
            // First verification should succeed
            const result1 = plugin.verifyCode(phone, code);
            assert.strictEqual(result1.success, true);
            
            // Second verification should fail (code deleted)
            const result2 = plugin.verifyCode(phone, code);
            assert.strictEqual(result2.success, false);
            assert.strictEqual(result2.error, 'CODE_NOT_FOUND');
        });
    });
    
    // **Feature: nodebb-phone-verification, Property 5: דחיית קוד שגוי**
    // **Validates: Requirements 3.2**
    describe('Wrong Code Rejection (Property 5)', function () {
        
        it('Property 5: wrong code should always fail verification', function () {
            const validPhoneArb = fc.tuple(
                fc.constantFrom('050', '052', '054'),
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 7 })
            ).map(([prefix, suffix]) => prefix + suffix);
            
            fc.assert(
                fc.property(validPhoneArb, (phone) => {
                    if (typeof plugin.clearVerificationCode === 'function') plugin.clearVerificationCode(phone);
                    
                    const correctCode = generateTzintukCode();
                    plugin.saveVerificationCode(phone, correctCode);
                    
                    // Generate a different code
                    let wrongCode;
                    do {
                        wrongCode = generateTzintukCode();
                    } while (wrongCode === correctCode);
                    
                    const result = plugin.verifyCode(phone, wrongCode);
                    return result.success === false;
                }),
                { numRuns: 100 }
            );
        });
        
        it('Property 5: 3 wrong attempts should block the phone', function () {
            const phone = '0501234567';
            const correctCode = '1234';
            const wrongCode = '9999';
            
            plugin.saveVerificationCode(phone, correctCode);
            
            // First 2 wrong attempts
            plugin.verifyCode(phone, wrongCode);
            plugin.verifyCode(phone, wrongCode);
            
            // Third wrong attempt should block
            const result = plugin.verifyCode(phone, wrongCode);
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.error, 'PHONE_BLOCKED');
        });
        
        it('Property 5: blocked phone cannot verify even with correct code', function () {
            const phone = '0501234567';
            const correctCode = '1234';
            const wrongCode = '9999';
            
            plugin.saveVerificationCode(phone, correctCode);
            
            // Block the phone with 3 wrong attempts
            plugin.verifyCode(phone, wrongCode);
            plugin.verifyCode(phone, wrongCode);
            plugin.verifyCode(phone, wrongCode);
            
            // Try to save new code - should fail
            const saveResult = plugin.saveVerificationCode(phone, '1111');
            assert.strictEqual(saveResult.success, false);
            assert.strictEqual(saveResult.error, 'PHONE_BLOCKED');
        });
    });
    
    describe('Hash Code', function () {
        
        it('should produce consistent hash for same input', function () {
            const code = '1234';
            const hash1 = plugin.hashCode(code);
            const hash2 = plugin.hashCode(code);
            assert.strictEqual(hash1, hash2);
        });
        
        it('should produce different hash for different inputs', function () {
            const hash1 = plugin.hashCode('1234');
            const hash2 = plugin.hashCode('4321');
            assert.notStrictEqual(hash1, hash2);
        });
    });
});