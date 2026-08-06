CREATE TABLE `user_passkeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`credential_id` varchar(255) NOT NULL,
	`public_key` text NOT NULL,
	`counter` int NOT NULL DEFAULT 0,
	`backed_up` boolean NOT NULL DEFAULT false,
	`transports` json,
	`name` varchar(100) NOT NULL,
	`last_used_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `user_passkeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_passkeys_credential_id_unique` UNIQUE(`credential_id`)
);
--> statement-breakpoint
CREATE TABLE `webauthn_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attempt_id` varchar(255) NOT NULL,
	`challenge` varchar(255) NOT NULL,
	`expires_at` datetime NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `webauthn_challenges_id` PRIMARY KEY(`id`),
	CONSTRAINT `webauthn_challenges_attempt_id_unique` UNIQUE(`attempt_id`)
);
--> statement-breakpoint
ALTER TABLE `user_passkeys` ADD CONSTRAINT `user_passkeys_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `user_passkeys_user_idx` ON `user_passkeys` (`user_id`);--> statement-breakpoint
CREATE INDEX `webauthn_challenges_expires_idx` ON `webauthn_challenges` (`expires_at`);