# The common targets (scripts/common.mk: link, install, reload, logs, pack, check,
# the nested shell, ...), then Library's own. 'make' alone prints help.
include scripts/common.mk

.PHONY: scan prune stalls

# scan is the user's real library, online with their own keys: theirs to run.
scan prune stalls:
	@$(DEV) $@
