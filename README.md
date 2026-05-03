# nodebb-plugin-phone-verification

Phone number verification plugin for NodeBB.

## Features

- Adds phone verification to the registration flow
- Supports phone verification updates from the user profile
- Includes admin tools for managing verified users
- Supports Call2All integration for tzintuk and user-initiated call flows
- Can block posting, voting, and messaging for unverified users

## Installation

```bash
npm install nodebb-plugin-phone-verification
```

Then activate the plugin in the NodeBB ACP, rebuild, and restart NodeBB.

## Configuration

The ACP page lets you configure:

- Call2All API token and endpoint
- tzintuk-based verification
- user-initiated call verification
- phone-based access restrictions for unverified users

## Repository

- GitHub: https://github.com/palmoni5/nodebb-plugin-phone-verification
- Issues: https://github.com/palmoni5/nodebb-plugin-phone-verification/issues
