-- Raise starter credits from $0.50 to $2.00 for all new signups, to give the
-- upcoming Play Store closed-testing cohort (and future users generally)
-- enough headroom to actually exercise AI features without hitting a paywall
-- almost immediately. Scoped to argument_mapper.profiles only -- does not
-- touch comment_cluster.profiles' own default in the shared keeper project.
alter table argument_mapper.profiles alter column credits_cents set default 200.0;
