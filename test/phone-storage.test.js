'use strict';

const assert = require('assert');
const fc = require('fast-check');
const plugin = require('../library');

describe('Phone Storage', function () {
    
    beforeEach(function () {
        plugin.clearAllPhones();
    });
    
    // **Feature: nodebb-phone-verification, Property 6: ייחודיות מספר טלפון**
    // **Validates: Requirements 4.1**
    describe('Phone Uniqueness (Property 6)', function () {
        
        it('Property 6: duplicate phone should be rejected for different user', function () {
            const validPhoneArb = fc.tuple(
                fc.constantFrom('050', '052', '054'),
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 7 })
            ).map(([prefix, suffix]) => prefix + suffix);
            
            const uidArb = fc.integer({ min: 1, max: 100000 });
            
            fc.assert(
                fc.property(validPhoneArb, uidArb, uidArb, (phone, uid1, uid2) => {
                    // Skip if same user
                    if (uid1 === uid2) return true;
                    
                    plugin.clearAllPhones();
                    
                    // First user saves phone
                    const result1 = plugin.savePhoneToUser(uid1, phone);
                    
                    // Second user tries same phone
                    const result2 = plugin.savePhoneToUser(uid2, phone);
                    
                    return result1.success === true && 
                           result2.success === false && 
                           result2.error === 'PHONE_EXISTS';
                }),
                { numRuns: 100 }
            );
        });
        
        it('Property 6: isPhoneExists should return true for existing phone', function () {
            const phone = '0501234567';
            const uid = 1;
            
            assert.strictEqual(plugin.isPhoneExists(phone), false);
            plugin.savePhoneToUser(uid, phone);
            assert.strictEqual(plugin.isPhoneExists(phone), true);
        });
        
        it('Property 6: same user can update their own phone', function () {
            const uid = 1;
            const phone1 = '0501234567';
            const phone2 = '0521234567';
            
            plugin.savePhoneToUser(uid, phone1);
            const result = plugin.savePhoneToUser(uid, phone1); // Same phone, same user
            assert.strictEqual(result.success, true);
        });
    });
    
    // **Feature: nodebb-phone-verification, Property 7: שמירה ושליפה (Round-trip)**
    // **Validates: Requirements 4.2, 4.3**
    describe('Save and Retrieve Round-trip (Property 7)', function () {
        
        it('Property 7: saved phone should be retrievable with same normalized value', function () {
            const validPhoneArb = fc.tuple(
                fc.constantFrom('050', '052', '054'),
                fc.boolean(), // with or without hyphen
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 7 })
            ).map(([prefix, hasHyphen, suffix]) => hasHyphen ? prefix + '-' + suffix : prefix + suffix);
            
            const uidArb = fc.integer({ min: 1, max: 100000 });
            
            fc.assert(
                fc.property(validPhoneArb, uidArb, (phone, uid) => {
                    plugin.clearAllPhones();
                    
                    plugin.savePhoneToUser(uid, phone);
                    const retrieved = plugin.getUserPhone(uid);
                    
                    // Retrieved phone should be normalized (no hyphens)
                    const expectedNormalized = plugin.normalizePhone(phone);
                    
                    return retrieved !== null && 
                           retrieved.phone === expectedNormalized &&
                           retrieved.phone.length === 10 &&
                           !retrieved.phone.includes('-');
                }),
                { numRuns: 100 }
            );
        });
        
        it('Property 7: findUserByPhone should return correct uid', function () {
            const validPhoneArb = fc.tuple(
                fc.constantFrom('050', '052', '054'),
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 7 })
            ).map(([prefix, suffix]) => prefix + suffix);
            
            const uidArb = fc.integer({ min: 1, max: 100000 });
            
            fc.assert(
                fc.property(validPhoneArb, uidArb, (phone, uid) => {
                    plugin.clearAllPhones();
                    
                    plugin.savePhoneToUser(uid, phone);
                    const foundUid = plugin.findUserByPhone(phone);
                    
                    return foundUid === uid;
                }),
                { numRuns: 100 }
            );
        });
    });
    
    describe('getAllUsersWithPhones', function () {
        
        it('should return all users with phones', function () {
            plugin.savePhoneToUser(1, '0501111111');
            plugin.savePhoneToUser(2, '0502222222');
            plugin.savePhoneToUser(3, '0503333333');
            
            const all = plugin.getAllUsersWithPhones();
            assert.strictEqual(all.length, 3);
        });
    });
});


    // **Feature: nodebb-phone-verification, Property 9: חיפוש לפי מספר טלפון**
    // **Validates: Requirements 5.2**
    describe('Search by Phone (Property 9)', function () {
        
        it('Property 9: findUserByPhone should return correct user for saved phone', function () {
            const validPhoneArb = fc.tuple(
                fc.constantFrom('050', '052', '054'),
                fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 7 })
            ).map(([prefix, suffix]) => prefix + suffix);
            
            const uidArb = fc.integer({ min: 1, max: 100000 });
            
            fc.assert(
                fc.property(validPhoneArb, uidArb, (phone, uid) => {
                    plugin.clearAllPhones();
                    
                    plugin.savePhoneToUser(uid, phone);
                    const foundUid = plugin.findUserByPhone(phone);
                    
                    return foundUid === uid;
                }),
                { numRuns: 100 }
            );
        });
        
        it('Property 9: search with hyphen should find same user as without', function () {
            const phone = '0501234567';
            const phoneWithHyphen = '050-1234567';
            const uid = 42;
            
            plugin.savePhoneToUser(uid, phone);
            
            const found1 = plugin.findUserByPhone(phone);
            const found2 = plugin.findUserByPhone(phoneWithHyphen);
            
            assert.strictEqual(found1, uid);
            assert.strictEqual(found2, uid);
        });
    });
    
    // **Feature: nodebb-phone-verification, Property 10: הסתרת טלפון ממשתמשים רגילים**
    // **Validates: Requirements 5.3**
    describe('Phone Privacy (Property 10)', function () {
        
        it('Property 10: admin can view any phone', function () {
            const uid = 1;
            const callerUid = 999;
            const isAdmin = true;
            
            assert.strictEqual(plugin.canViewPhone(uid, callerUid, isAdmin), true);
        });
        
        it('Property 10: regular user cannot view other user phone', function () {
            const uid = 1;
            const callerUid = 2;
            const isAdmin = false;
            
            assert.strictEqual(plugin.canViewPhone(uid, callerUid, isAdmin), false);
        });
        
        it('Property 10: user can view own phone', function () {
            const uid = 1;
            const callerUid = 1;
            const isAdmin = false;
            
            assert.strictEqual(plugin.canViewPhone(uid, callerUid, isAdmin), true);
        });
        
        it('Property 10: privacy rule applies to all users', function () {
            const uidArb = fc.integer({ min: 1, max: 100000 });
            
            fc.assert(
                fc.property(uidArb, uidArb, (uid, callerUid) => {
                    const isAdmin = false;
                    const canView = plugin.canViewPhone(uid, callerUid, isAdmin);
                    
                    // Non-admin can only view own phone
                    return canView === (uid === callerUid);
                }),
                { numRuns: 100 }
            );
        });
    });
